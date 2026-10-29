/**
 * `nwf-pe jurisdiction-claims record ...` - REL Q1: RECORD ONE SOURCE-STATED
 * COUNTRY-OF-OPERATION CLAIM FOR ONE DISCOVERY SUBJECT (ADR 0024 s7,
 * migration 0021).
 *
 * The operator states, explicitly, which ISO 3166-1 alpha-2 country a stored
 * source the subject ALREADY HOLDS says the subject operates in:
 *
 *   --source-page-evidence-id <uuid>   page evidence captured under one of the
 *                                      subject's admissions, or cited by one
 *                                      of its identity claims (observed_at is
 *                                      the page's own; --observed-at refused)
 *   --source-url <url> [--source-version <sha256>] --observed-at <instant>
 *                                      the exact provenance one of the
 *                                      subject's identity claims cites
 *   --source-website-claim-id          REFUSED (a website claim states no
 *                                      country; reading one from it would be
 *                                      a domain inference)
 *
 * plus `--basis SOURCE_STATED`. There is no option that takes a domain, a
 * name, a language or an Erasmus code, and nothing here infers a country.
 *
 * DRY RUN BY DEFAULT: without `--execute` the judgement runs on the readonly
 * role in a READ ONLY transaction and writes nothing. With it, the command
 * runs on DATABASE_URL_DISCOVERY_SUBJECT_WRITER, which must hold
 * nwf_discovery_subject_writer and must not be a superuser or the table
 * owner. One subject and one claim per call: no batch, no `--all`, no actor
 * key, no credential option, no generic SQL. Nothing here fetches, resolves,
 * calls a model, scores, ranks or contacts anyone. A recorded claim is
 * evidence, not a review, not a verification and not a permission.
 */
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { env } from '../../config/env.js';
import { createPool } from '../../db/client.js';
import {
  JURISDICTION_WRITER_CONTRACT,
  JurisdictionWriterRefusal,
  checkCountryOfOperationRequest,
  planCountryOfOperationClaim,
  recordCountryOfOperationClaim,
  type CountryOfOperationRequest,
  type CountryOfOperationResult,
  type CountrySourceInput,
} from '../../orgunits/jurisdictionClaimWriter/record.js';

export const JURISDICTION_CLAIMS_USAGE = `nwf-pe jurisdiction-claims - record one source-stated country of operation (REL Q1)

  jurisdiction-claims record --subject-id <uuid> --country-of-operation <CC>
                             (--source-page-evidence-id <uuid>
                              | --source-url <url> [--source-version <sha256>] --observed-at <ISO-8601 UTC>)
                             --basis SOURCE_STATED [--execute] [--json]

  <CC> is what the cited source STATES: an officially assigned, upper-case ISO 3166-1
  alpha-2 code. The source must already be held by the subject (page evidence captured
  under one of its admissions or cited by one of its identity claims, or a public URL
  one of its identity claims cites). A website claim states no country and is refused.
  A DRY RUN unless --execute. A disagreeing claim is recorded, not refused: the
  subject's country then reads CONFLICTING and the export carries country null.
`;

export const JURISDICTION_CLAIMS_OPTIONS = Object.freeze({
  'subject-id': { type: 'string' },
  'country-of-operation': { type: 'string' },
  'source-page-evidence-id': { type: 'string' },
  'source-url': { type: 'string' },
  'source-version': { type: 'string' },
  'source-website-claim-id': { type: 'string' },
  'observed-at': { type: 'string' },
  basis: { type: 'string' },
  execute: { type: 'boolean' },
  json: { type: 'boolean' },
} as const);

export interface JurisdictionClaimsCliDependencies {
  readonly readonlyPool?: () => pg.Pool;
  readonly writerPool?: () => pg.Pool;
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

class UsageError extends Error {}

type Values = Record<string, string | boolean | undefined>;

function str(values: Values, name: string): string | undefined {
  const v = values[name];
  return typeof v === 'string' ? v : undefined;
}

function required(values: Values, name: string): string {
  const v = str(values, name);
  if (v === undefined || v.length === 0) throw new UsageError(`--${name} is required.`);
  return v;
}

function sourceOf(values: Values): CountrySourceInput {
  const page = str(values, 'source-page-evidence-id');
  const url = str(values, 'source-url');
  const website = str(values, 'source-website-claim-id');
  const given = [page, url, website].filter((v) => v !== undefined);
  if (given.length !== 1) {
    throw new UsageError(
      'exactly one source is required: --source-page-evidence-id or --source-url ' +
        '(a jurisdiction claim is never recorded without a stored source).',
    );
  }
  const version = str(values, 'source-version');
  const observedAt = str(values, 'observed-at');
  if (version !== undefined && url === undefined) {
    throw new UsageError('--source-version applies to --source-url only.');
  }
  if (page !== undefined) {
    if (observedAt !== undefined) {
      throw new UsageError(
        "--observed-at is not accepted with --source-page-evidence-id: the page's own observed_at is used.",
      );
    }
    return { sourceType: 'PAGE_EVIDENCE', pageEvidenceId: page };
  }
  if (url !== undefined) {
    return {
      sourceType: 'PUBLIC_URL',
      url,
      versionRef: version ?? null,
      observedAt: required(values, 'observed-at'),
    };
  }
  return { sourceType: 'WEBSITE_CLAIM', websiteClaimId: website! };
}

function render(r: CountryOfOperationResult): string {
  const standing = (s: CountryOfOperationResult['standingAfter']) =>
    s.state === 'STATED'
      ? `STATED ${s.value}`
      : s.state === 'CONFLICTING'
        ? `CONFLICTING ${s.values.join('/')}`
        : 'UNKNOWN';
  const source =
    r.claim.sourceType === 'PAGE_EVIDENCE'
      ? `page evidence ${r.claim.sourcePageEvidenceId}`
      : `public URL ${r.claim.sourceUrl}${r.claim.sourceVersionRef === null ? '' : ` (version ${r.claim.sourceVersionRef})`}`;
  return (
    `${r.mode === 'DRY_RUN' ? 'DRY RUN - nothing was written. Would append' : 'EXECUTED - appended'}:\n` +
    `  claim ${r.claimId}${r.mode === 'DRY_RUN' ? ' (provisional)' : ''}\n` +
    `  subject ${r.subjectId}: COUNTRY_OF_OPERATION ${r.claim.claimedCountry} (SOURCE_STATED)\n` +
    `  source ${source}, observed ${r.claim.observedAt}; held as ${r.holding}\n` +
    `  recorded by path ${r.claim.recordedByActorKey} (a path key, not a person)\n` +
    `  country of operation: ${standing(r.standingBefore)} -> ${standing(r.standingAfter)}\n` +
    `  qualification-input export country: ${r.exportCountryAfter ?? 'null (not rankable)'}\n` +
    `  grants: nothing (no review, no verification, no research, no contact permission)\n`
  );
}

/** Runs one `jurisdiction-claims` invocation. `argv` starts at the subcommand. */
export async function runJurisdictionClaimsCli(
  argv: readonly string[],
  deps: JurisdictionClaimsCliDependencies = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => void process.stdout.write(t));
  const err = deps.err ?? ((t: string) => void process.stderr.write(t));
  const [sub, ...rest] = argv;
  if (sub !== 'record') {
    (sub === '--help' || sub === '-h' ? out : err)(JURISDICTION_CLAIMS_USAGE);
    return sub === '--help' || sub === '-h' ? 0 : 1;
  }
  const json = rest.includes('--json');
  const refuse = (code: string, detail: string): number => {
    if (json) {
      out(
        `${JSON.stringify({ contract: JURISDICTION_WRITER_CONTRACT, outcome: 'REFUSED', code, detail }, null, 2)}\n`,
      );
    }
    err(
      `REFUSED ${code}: ${detail.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')}\n`,
    );
    return 1;
  };

  let request: CountryOfOperationRequest;
  let execute: boolean;
  try {
    const parsed = parseArgs({
      args: [...rest],
      options: JURISDICTION_CLAIMS_OPTIONS,
      strict: true,
      allowPositionals: false,
    });
    const values = parsed.values as Values;
    execute = values['execute'] === true;
    request = {
      subjectId: required(values, 'subject-id'),
      statedCountry: required(values, 'country-of-operation'),
      source: sourceOf(values),
      claimBasis: required(values, 'basis'),
    };
    // The request's own shape is refused before any connection is opened.
    checkCountryOfOperationRequest(request);
  } catch (error) {
    if (error instanceof JurisdictionWriterRefusal) return refuse(error.code, error.detail);
    return refuse('INPUT_INVALID', error instanceof Error ? error.message : String(error));
  }

  const readonlyPool = deps.readonlyPool ?? (() => createPool('readonly'));
  const writerPool =
    deps.writerPool ??
    (() => {
      if (env().DATABASE_URL_DISCOVERY_SUBJECT_WRITER === undefined) {
        throw new UsageError(
          'DATABASE_URL_DISCOVERY_SUBJECT_WRITER is not set: record --execute needs a ' +
            'deployment-provisioned login holding nwf_discovery_subject_writer ' +
            '(never the owner or a superuser).',
        );
      }
      return createPool('discovery_subject_writer');
    });

  try {
    const pool = execute ? writerPool() : readonlyPool();
    try {
      const result = execute
        ? await recordCountryOfOperationClaim(pool, request)
        : await planCountryOfOperationClaim(pool, request);
      out(
        json
          ? `${JSON.stringify({ contract: JURISDICTION_WRITER_CONTRACT, outcome: result.mode, data: result }, null, 2)}\n`
          : render(result),
      );
      return 0;
    } finally {
      await pool.end();
    }
  } catch (error) {
    if (error instanceof UsageError) return refuse('INPUT_INVALID', error.message);
    if (error instanceof JurisdictionWriterRefusal) return refuse(error.code, error.detail);
    return refuse('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  }
}
