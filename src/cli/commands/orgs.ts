import { withPool } from '../../db/client.js';
import * as log from '../../logging/log.js';
import { normaliseErasmusCode } from '../../ingest/eche/normalise.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

export async function runOrgsList(args: {
  country?: string | undefined;
  limit?: number | undefined;
}): Promise<number> {
  const limit = args.limit ?? 50;
  const country = args.country ? args.country.toUpperCase() : null;

  return withPool('readonly', async (pool) => {
    const { rows } = await pool.query<{
      erasmus_code: string;
      country_code: string;
      city: string | null;
      legal_name: string;
      canonical_domain: string | null;
    }>(
      `SELECT erasmus_code, country_code, city, legal_name, canonical_domain
         FROM organisations
        WHERE ($1::text IS NULL OR country_code = $1)
        ORDER BY country_code, erasmus_code
        LIMIT $2`,
      [country, limit],
    );

    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM organisations
        WHERE ($1::text IS NULL OR country_code = $1)`,
      [country],
    );
    const total = Number.parseInt(countRows[0]?.count ?? '0', 10);

    if (rows.length === 0) {
      process.stdout.write('No organisations found.\n');
      return 0;
    }

    const lines = [
      '',
      `${pad('ERASMUS CODE', 18)}${pad('CC', 4)}${pad('CITY', 22)}${pad('DOMAIN', 26)}NAME`,
      '-'.repeat(120),
    ];
    for (const row of rows) {
      lines.push(
        pad(row.erasmus_code, 18) +
          pad(row.country_code, 4) +
          pad(row.city ?? '-', 22) +
          pad(row.canonical_domain ?? '-', 26) +
          row.legal_name,
      );
    }
    lines.push('', `Showing ${rows.length} of ${total} organisation(s).`, '');
    process.stdout.write(lines.join('\n'));
    return 0;
  });
}

export async function runOrgsShow(identifier: string): Promise<number> {
  return withPool('readonly', async (pool) => {
    const isUuid = UUID_PATTERN.test(identifier);
    const normalisedCode = normaliseErasmusCode(identifier);

    const { rows } = await pool.query<{
      id: string;
      eche_row_key: string;
      legal_name: string;
      display_name: string;
      country_code: string;
      city: string | null;
      erasmus_code: string;
      pic: string | null;
      oid: string | null;
      website_url: string | null;
      canonical_domain: string | null;
      org_type: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM organisations
        WHERE ($1::boolean AND id::text = $2) OR (NOT $1::boolean AND erasmus_code = $3)
        ORDER BY created_at`,
      [isUuid, identifier, normalisedCode],
    );

    if (rows.length === 0) {
      log.error(`No organisation found for "${identifier}".`);
      return 1;
    }

    if (rows.length > 1) {
      log.warn(
        `${rows.length} organisations share Erasmus code "${normalisedCode}". ` +
          `This is expected: the ECHE dataset is not unique on Erasmus code. ` +
          `All matches are shown below.`,
      );
    }

    for (const org of rows) {
      // The run is joined in so provenance can be shown truthfully. `source_url`
      // holds a LOCAL PATH when the operator supplied a file, and only
      // source_input_kind distinguishes the two - printing it as "source url"
      // unqualified would imply an official URL that does not exist.
      const { rows: sources } = await pool.query<{
        source_system: string;
        source_record_id: string;
        source_url: string;
        source_licence: string;
        retrieved_at: Date;
        payload_sha256: string;
        raw_payload: Record<string, unknown>;
        ingest_run_id: string;
        created_at: Date;
        source_input_kind: string;
        source_page_url: string | null;
        source_file_sha256: string | null;
      }>(
        `SELECT s.source_system, s.source_record_id, s.source_url, s.source_licence,
                s.retrieved_at, s.payload_sha256, s.raw_payload, s.ingest_run_id,
                s.created_at, r.source_input_kind, r.source_page_url, r.source_file_sha256
           FROM organisation_sources s
           JOIN ingest_runs r ON r.id = s.ingest_run_id
          WHERE s.organisation_id = $1
          ORDER BY s.created_at`,
        [org.id],
      );

      const out = [
        '',
        '='.repeat(100),
        `ORGANISATION  ${org.legal_name}`,
        '='.repeat(100),
        `id               : ${org.id}`,
        `eche_row_key     : ${org.eche_row_key}`,
        `erasmus_code     : ${org.erasmus_code}`,
        `pic / oid        : ${org.pic ?? '-'} / ${org.oid ?? '-'}`,
        `country / city   : ${org.country_code} / ${org.city ?? '-'}`,
        `website_url      : ${org.website_url ?? '-'}`,
        `canonical_domain : ${org.canonical_domain ?? '-'}`,
        `org_type         : ${org.org_type}`,
        `created / updated: ${org.created_at.toISOString()} / ${org.updated_at.toISOString()}`,
        '',
        `PROVENANCE (${sources.length} record${sources.length === 1 ? '' : 's'}, append-only)`,
        '-'.repeat(100),
      ];

      sources.forEach((source, index) => {
        const localFile = source.source_input_kind === 'operator_file';
        out.push(
          `[${index + 1}] system      : ${source.source_system}`,
          `    record id   : ${source.source_record_id}`,
          `    input kind  : ${source.source_input_kind}`,
          `    official pg : ${source.source_page_url ?? '- (not discovered from the official page)'}`,
          localFile
            ? `    local file  : ${source.source_url}  (LOCAL COPY - not a published URL)`
            : `    source url  : ${source.source_url}`,
          `    file sha256 : ${source.source_file_sha256 ?? '-'}`,
          `    licence     : ${source.source_licence}`,
          `    retrieved   : ${source.retrieved_at.toISOString()}`,
          `    payload sha : ${source.payload_sha256}`,
          `    ingest run  : ${source.ingest_run_id}`,
          `    raw payload : ${JSON.stringify(source.raw_payload)}`,
          '',
        );
      });

      process.stdout.write(out.join('\n'));
    }
    return 0;
  });
}

/**
 * Reports duplicate key values. These are DATA TO ANALYSE, not errors: no
 * automatic merging exists in Phase 1A and none should be added without an
 * approved entity-resolution design.
 *
 * None of these columns is an identity key. See the COMMENT ON TABLE text in
 * migrations/0001_organisations.sql for what an organisations row means.
 */
export async function runOrgsDuplicates(): Promise<number> {
  return withPool('readonly', async (pool) => {
    const report: string[] = [''];

    for (const column of ['erasmus_code', 'pic', 'oid', 'canonical_domain'] as const) {
      const { rows } = await pool.query<{ value: string; n: string }>(
        `SELECT ${column} AS value, count(*)::text AS n
           FROM organisations
          WHERE ${column} IS NOT NULL
          GROUP BY ${column}
         HAVING count(*) > 1
          ORDER BY count(*) DESC, ${column}
          LIMIT 20`,
      );
      const { rows: totals } = await pool.query<{ distinct: string; total: string }>(
        `SELECT count(DISTINCT ${column})::text AS distinct,
                count(${column})::text AS total
           FROM organisations`,
      );
      const distinct = totals[0]?.distinct ?? '0';
      const total = totals[0]?.total ?? '0';
      const surplus = Number.parseInt(total, 10) - Number.parseInt(distinct, 10);

      report.push(
        `${column}: non-null=${total} distinct=${distinct} surplusRows=${surplus} ` +
          `duplicatedValues=${rows.length >= 20 ? '20+' : rows.length}`,
      );
      for (const row of rows.slice(0, 5)) {
        report.push(`    ${row.value}  x${row.n}`);
      }
    }

    report.push(
      '',
      'Duplicates are reported, never merged. An organisation row is a PROVISIONAL',
      'record derived from one ECHE source row, not a verified unique institution.',
      'canonical_domain in particular is enrichment data, never identity: shared',
      'education portals and generic hosts put unrelated institutions on one domain.',
      'Entity resolution is a later gated phase and has not been carried out.',
      '',
    );
    process.stdout.write(report.join('\n'));
    return 0;
  });
}
