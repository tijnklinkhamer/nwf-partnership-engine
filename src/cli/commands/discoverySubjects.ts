/**
 * `nwf-pe discovery-subjects ...` - THE CONTROLLED DISCOVERY-SUBJECT REGISTRY
 * (Track B, B2.2). For SYNTHETIC / manually registered candidate subjects.
 *
 *   propose  one subject + its first NAME claim, atomically
 *   claim    one identity claim (name, kind, public website, typed identifier)
 *   relate   one relationship claim (to a subject or an ECHE source row)
 *   review   PREVIEW of one review decision; execution is DISABLED
 *   show     the derived identity read model of one subject
 *   list     one bounded, keyset-paginated page of subjects
 *
 * NARROW BY CONSTRUCTION. Each subcommand parses its OWN strict option set;
 * an option it does not name is an error, never ignored. There is no generic
 * SQL, JSON, CSV, bulk or "set field" surface, no `--actor-key`, and no
 * credential option: connection strings come from the environment only.
 *
 * DRY RUN BY DEFAULT. Without `--execute` a write-capable command runs on the
 * READONLY role in a read-only transaction and writes nothing. With it, the
 * command runs on DATABASE_URL_DISCOVERY_SUBJECT_WRITER, which must hold the
 * nwf_discovery_subject_writer capability and must not be a superuser or the
 * table owner; the writer re-judges everything inside its own transaction.
 *
 * `review --execute` IS REFUSED with REVIEWER_TRUST_PRIMITIVE_ABSENT before
 * any connection is opened: the Engine has no trusted reviewer identity
 * (ADR 0020 s6). Nothing here fetches a URL, resolves a host, calls a model,
 * starts research, scores, or contacts anyone.
 */
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { createPool } from '../../db/client.js';
import { env } from '../../config/env.js';
import {
  IDENTITY_CLAIM_KINDS,
  RELATIONSHIP_PREDICATES,
  REVIEW_OUTCOMES,
  type ClaimBasis,
  type RelationshipPredicate,
  type ReviewOutcome,
  type SubjectKind,
} from '../../orgunits/identity/vocabulary.js';
import {
  deriveSubjectReadModel,
  summariseSubjectPage,
  type IdentityClaimView,
  type SubjectListPage,
  type SubjectReadModel,
} from '../../orgunits/subjectRegistry/readModel.js';
import {
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  SUBJECT_REGISTRY_CONTRACT,
  UUID_SHAPE,
  type IdentityClaimPayload,
  type ProvenanceInput,
  type RelationshipTargetInput,
} from '../../orgunits/subjectRegistry/requests.js';
import { REVIEWER_TRUST_PRIMITIVE_ABSENT } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import {
  databaseNow,
  loadSubjectGraph,
  loadSubjectPage,
  SubjectGraphBoundExceeded,
} from '../../orgunits/subjectRegistry/store.js';
import {
  RegistryRefusal,
  executeClaim,
  executePropose,
  executeRelate,
  planClaim,
  planPropose,
  planRelate,
  planReview,
  type RegistryResult,
  type ReviewTarget,
} from '../../orgunits/subjectRegistry/writer.js';

export const DISCOVERY_SUBJECTS_USAGE = `nwf-pe discovery-subjects - controlled discovery-subject registry (B2.2)

  discovery-subjects propose --subject-id <uuid> --kind <KIND> --name <text>
                             [--name-language <tag>] [--note <text>] <source> [--execute] [--json]
  discovery-subjects claim   --subject-id <uuid> --claim-kind <CLAIM_KIND> <payload> <source>
                             [--execute] [--json]
  discovery-subjects relate  --subject-id <uuid> --predicate <PREDICATE>
                             (--target-subject-id <uuid> | --target-eche-row-key <key>)
                             <source> [--execute] [--json]
  discovery-subjects review  (--subject <uuid> | --identity-claim <uuid> | --relationship-claim <uuid>)
                             --outcome <OUTCOME> --expect-head <review-uuid|none>
                             --expect-state <digest> [--reason <text>] [--json]
  discovery-subjects show    --subject-id <uuid> [--json]
  discovery-subjects list    [--limit <1-${LIST_MAX_LIMIT}>] [--after <uuid>] [--json]

  <source>   exactly one of --source-url <public-url> [--source-version <sha256>],
             --source-page-evidence-id <uuid>, --source-website-claim-id <uuid>;
             plus --observed-at <ISO-8601 UTC> and --basis SOURCE_STATED|INFERRED.
  <payload>  NAME/ALTERNATE_NAME: --name [--name-language]; NATIVE_NAME: --name --name-language;
             ENTITY_KIND: --entity-kind; PUBLIC_WEBSITE: --website-url;
             EXTERNAL_IDENTIFIER: --identifier-scheme --identifier-value.

Every write-capable command is a DRY RUN unless --execute is given. A source
URL is recorded, never fetched. A registered or reviewed subject is NOT
verified, NOT research-eligible and NOT cleared for any contact.
\`review\` is a PREVIEW only: --execute is refused (${REVIEWER_TRUST_PRIMITIVE_ABSENT}).
`;

type OptionSpec = Record<string, { type: 'string' | 'boolean' }>;

const SOURCE_OPTIONS: OptionSpec = {
  'source-url': { type: 'string' },
  'source-version': { type: 'string' },
  'source-page-evidence-id': { type: 'string' },
  'source-website-claim-id': { type: 'string' },
  'observed-at': { type: 'string' },
  basis: { type: 'string' },
};
const OUTPUT_OPTIONS: OptionSpec = { json: { type: 'boolean' } };
const WRITE_OPTIONS: OptionSpec = { ...OUTPUT_OPTIONS, execute: { type: 'boolean' } };

/** The exact option set of every subcommand. Nothing outside it is accepted. */
export const DISCOVERY_SUBJECTS_OPTIONS: Readonly<Record<string, OptionSpec>> = Object.freeze({
  propose: {
    'subject-id': { type: 'string' },
    kind: { type: 'string' },
    name: { type: 'string' },
    'name-language': { type: 'string' },
    note: { type: 'string' },
    ...SOURCE_OPTIONS,
    ...WRITE_OPTIONS,
  },
  claim: {
    'subject-id': { type: 'string' },
    'claim-kind': { type: 'string' },
    name: { type: 'string' },
    'name-language': { type: 'string' },
    'entity-kind': { type: 'string' },
    'website-url': { type: 'string' },
    'identifier-scheme': { type: 'string' },
    'identifier-value': { type: 'string' },
    ...SOURCE_OPTIONS,
    ...WRITE_OPTIONS,
  },
  relate: {
    'subject-id': { type: 'string' },
    predicate: { type: 'string' },
    'target-subject-id': { type: 'string' },
    'target-eche-row-key': { type: 'string' },
    ...SOURCE_OPTIONS,
    ...WRITE_OPTIONS,
  },
  review: {
    subject: { type: 'string' },
    'identity-claim': { type: 'string' },
    'relationship-claim': { type: 'string' },
    outcome: { type: 'string' },
    'expect-head': { type: 'string' },
    'expect-state': { type: 'string' },
    reason: { type: 'string' },
    ...WRITE_OPTIONS,
  },
  show: { 'subject-id': { type: 'string' }, ...OUTPUT_OPTIONS },
  list: { limit: { type: 'string' }, after: { type: 'string' }, ...OUTPUT_OPTIONS },
});

/** Injected in tests; production builds pools from the environment. */
export interface DiscoverySubjectsDeps {
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

function forbidTogether(values: Values, names: readonly string[], why: string): void {
  const present = names.filter((n) => values[n] !== undefined);
  if (present.length > 0) {
    throw new UsageError(`${present.map((n) => `--${n}`).join(', ')} ${why}`);
  }
}

function sourceOf(values: Values): ProvenanceInput {
  const url = str(values, 'source-url');
  const page = str(values, 'source-page-evidence-id');
  const website = str(values, 'source-website-claim-id');
  const given = [url, page, website].filter((v) => v !== undefined);
  if (given.length !== 1) {
    throw new UsageError(
      'exactly one of --source-url, --source-page-evidence-id, --source-website-claim-id is required.',
    );
  }
  const version = str(values, 'source-version');
  if (version !== undefined && url === undefined) {
    throw new UsageError('--source-version applies to --source-url only.');
  }
  const source: ProvenanceInput['source'] =
    url !== undefined
      ? { sourceType: 'PUBLIC_URL', url, versionRef: version ?? null }
      : page !== undefined
        ? { sourceType: 'PAGE_EVIDENCE', pageEvidenceId: page }
        : { sourceType: 'WEBSITE_CLAIM', websiteClaimId: website! };
  return {
    source,
    observedAt: required(values, 'observed-at'),
    claimBasis: required(values, 'basis') as ClaimBasis,
  };
}

function payloadOf(values: Values): IdentityClaimPayload {
  const kind = required(values, 'claim-kind');
  if (!(IDENTITY_CLAIM_KINDS as readonly string[]).includes(kind)) {
    throw new UsageError(`--claim-kind must be one of ${IDENTITY_CLAIM_KINDS.join(', ')}.`);
  }
  const nameFields = ['name', 'name-language'];
  const others = ['entity-kind', 'website-url', 'identifier-scheme', 'identifier-value'];
  const notFor = `does not belong to a ${kind} claim.`;
  switch (kind) {
    case 'NAME':
    case 'ALTERNATE_NAME':
      forbidTogether(values, others, notFor);
      return {
        claimKind: kind,
        nameText: required(values, 'name'),
        nameLanguage: str(values, 'name-language') ?? null,
      };
    case 'NATIVE_NAME':
      forbidTogether(values, others, notFor);
      return {
        claimKind: 'NATIVE_NAME',
        nameText: required(values, 'name'),
        nameLanguage: required(values, 'name-language'),
      };
    case 'ENTITY_KIND':
      forbidTogether(values, [...nameFields, ...others.slice(1)], notFor);
      return {
        claimKind: 'ENTITY_KIND',
        claimedKind: required(values, 'entity-kind') as SubjectKind,
      };
    case 'PUBLIC_WEBSITE':
      forbidTogether(values, [...nameFields, 'entity-kind', ...others.slice(2)], notFor);
      return { claimKind: 'PUBLIC_WEBSITE', websiteUrl: required(values, 'website-url') };
    default:
      forbidTogether(values, [...nameFields, 'entity-kind', 'website-url'], notFor);
      return {
        claimKind: 'EXTERNAL_IDENTIFIER',
        identifierScheme: required(values, 'identifier-scheme'),
        identifierValue: required(values, 'identifier-value'),
      };
  }
}

function reviewTargetOf(values: Values): ReviewTarget {
  const targets: ReviewTarget[] = [];
  const subject = str(values, 'subject');
  const identity = str(values, 'identity-claim');
  const relationship = str(values, 'relationship-claim');
  if (subject !== undefined) targets.push({ kind: 'SUBJECT', id: subject });
  if (identity !== undefined) targets.push({ kind: 'IDENTITY_CLAIM', id: identity });
  if (relationship !== undefined) targets.push({ kind: 'RELATIONSHIP_CLAIM', id: relationship });
  if (targets.length !== 1) {
    throw new UsageError(
      'exactly one of --subject, --identity-claim, --relationship-claim names the review target.',
    );
  }
  return targets[0]!;
}

/** Connection strings never reach output. */
function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]');
}

function envelope(
  operation: string,
  outcome: 'DRY_RUN' | 'EXECUTED' | 'REFUSED' | 'READ',
  body: Record<string, unknown>,
): string {
  return `${JSON.stringify({ contract: SUBJECT_REGISTRY_CONTRACT, operation, outcome, ...body }, null, 2)}\n`;
}

function claimLine(c: IdentityClaimView): string {
  const language = c.nameLanguage !== null ? ` (${c.nameLanguage})` : '';
  const head = c.reviewHeadId !== null ? ` head ${c.reviewHeadId}` : '';
  return (
    `    [${c.review}] ${c.claimKind} ${JSON.stringify(c.value)}${language}  claim ${c.claimId}${head}\n` +
    `        source ${c.provenance.sourceType} ${c.provenance.sourceRef}` +
    ` observed ${c.provenance.observedAt} ${c.provenance.claimBasis}` +
    ` recorded by ${c.provenance.recordedByActorKey}\n`
  );
}

export function renderReadModel(m: SubjectReadModel): string {
  const s = m.identityStatus;
  const list = (items: readonly string[]) => (items.length === 0 ? 'none' : items.join(', '));
  const section = (title: string, claims: readonly IdentityClaimView[]) =>
    `  ${title}:${claims.length === 0 ? ' none\n' : `\n${claims.map(claimLine).join('')}`}`;
  const findings = (title: string, items: SubjectReadModel['findings']['invalid']) =>
    `  ${title}: ${items.length === 0 ? 'none' : items.map((f) => `${f.code} (${f.recordId})`).join(', ')}\n`;
  return (
    `Discovery subject ${m.subjectId}\n` +
    `  registered kind      : ${m.registeredKind} (a working label, not a classification)\n` +
    `  registered by path   : ${m.registeredByActorKey} (a path key, not an authenticated OWNER)\n` +
    `  status               : proposed; structurally ${s.structurallyValid ? 'valid' : 'INVALID'}; ` +
    `${s.conflicted ? 'CONFLICTED' : 'no conflict'}; review coverage ${s.reviewCoverage}\n` +
    `  identity review      : ${s.identityReview}${s.identityReviewHeadId !== null ? ` (head ${s.identityReviewHeadId})` : ''}; ` +
    `review-confirmed: ${s.reviewConfirmed ? 'yes' : 'no'}\n` +
    `  factual verification : ${s.factualVerification}\n` +
    section('names', m.names) +
    `  kinds: claimed ${list(m.kinds.claimed)}; reviewed ${m.kinds.reviewed ?? 'none'}\n` +
    m.kinds.claims.map(claimLine).join('') +
    section('public websites (recorded, never fetched)', m.websites) +
    section('typed identifiers (shape-checked only)', m.identifiers) +
    `  relationships:${m.relationships.length === 0 ? ' none' : ''}\n` +
    m.relationships
      .map(
        (r) =>
          `    [${r.review}] ${r.predicate} -> ${r.targetKey} ` +
          `(${r.structural ? 'structural' : 'non-structural'}; ${r.assertionBasis})  claim ${r.claimId}` +
          `${r.reviewHeadId !== null ? ` head ${r.reviewHeadId}` : ''}\n`,
      )
      .join('') +
    findings('invalid', m.findings.invalid) +
    findings('conflicts', m.findings.conflicts) +
    findings('unresolved', m.findings.unresolved) +
    findings('review signals', m.findings.reviewSignals) +
    `  missing evidence     : ${list(m.missingEvidence)}\n` +
    `  review execution     : ${m.reviewability.authoritativeReviewExecution} (${m.reviewability.blocker}); ` +
    `${m.reviewability.unreviewedTargets} unreviewed target(s)\n` +
    `  research authority   : NOT GRANTED (${m.researchAuthority.reasons.join(', ')})\n` +
    `  state digest         : ${m.stateDigest}\n`
  );
}

function renderList(page: SubjectListPage): string {
  if (page.subjects.length === 0) return 'No discovery subjects on this page.\n';
  return (
    page.subjects
      .map(
        (s) =>
          `${s.subjectId}  ${s.registeredKind}  review ${s.identityReview}  ` +
          `${s.names.length === 0 ? '(no name claim)' : s.names.map((n) => JSON.stringify(n)).join(' / ')}` +
          `  research NOT_GRANTED\n`,
      )
      .join('') + (page.nextAfter !== null ? `-- more: --after ${page.nextAfter}\n` : '')
  );
}

function renderResult(r: RegistryResult): string {
  const verb =
    r.mode === 'DRY_RUN'
      ? `DRY RUN - nothing was written. ${r.operation} would append:`
      : `EXECUTED - ${r.operation} appended:`;
  const ids = Object.entries(r.recordIds)
    .map(
      ([k, v]) => `  ${k}: ${v}${r.mode === 'DRY_RUN' && k !== 'subject' ? ' (provisional)' : ''}`,
    )
    .join('\n');
  return `${verb}\n${ids}\n\n${renderReadModel(r.readModel)}`;
}

async function withPoolOf<T>(factory: () => pg.Pool, fn: (pool: pg.Pool) => Promise<T>) {
  const pool = factory();
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

/** Runs one `discovery-subjects` invocation. `argv` starts at the subcommand. */
export async function runDiscoverySubjects(
  argv: readonly string[],
  deps: DiscoverySubjectsDeps = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => void process.stdout.write(t));
  const err = deps.err ?? ((t: string) => void process.stderr.write(t));
  const readonlyPool = deps.readonlyPool ?? (() => createPool('readonly'));
  const writerPool =
    deps.writerPool ??
    (() => {
      if (env().DATABASE_URL_DISCOVERY_SUBJECT_WRITER === undefined) {
        throw new UsageError(
          'DATABASE_URL_DISCOVERY_SUBJECT_WRITER is not set: --execute needs a ' +
            'deployment-provisioned login holding nwf_discovery_subject_writer ' +
            '(never the owner or a superuser).',
        );
      }
      return createPool('discovery_subject_writer');
    });

  const [sub, ...rest] = argv;
  if (sub === undefined || sub === '--help' || sub === '-h' || sub === 'help') {
    out(DISCOVERY_SUBJECTS_USAGE);
    return sub === undefined ? 1 : 0;
  }
  const spec = Object.hasOwn(DISCOVERY_SUBJECTS_OPTIONS, sub)
    ? DISCOVERY_SUBJECTS_OPTIONS[sub]
    : undefined;
  if (spec === undefined) {
    err(`Unknown discovery-subjects command: ${sub}\n`);
    out(DISCOVERY_SUBJECTS_USAGE);
    return 1;
  }

  let values: Values;
  try {
    const parsed = parseArgs({
      args: [...rest],
      options: spec,
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values as Values;
  } catch (error) {
    const detail = redact(error instanceof Error ? error.message : String(error));
    if (rest.includes('--json')) out(envelope(sub, 'REFUSED', { code: 'INPUT_INVALID', detail }));
    err(`REFUSED INPUT_INVALID: ${detail}\n`);
    return 1;
  }
  const json = values['json'] === true;
  const execute = values['execute'] === true;

  const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}) => {
    if (json) out(envelope(sub, 'REFUSED', { code, detail, ...extra }));
    err(`REFUSED ${code}: ${redact(detail)}\n`);
    const findings = (extra['findings'] ?? []) as {
      code: string;
      recordId: string;
      field: string | null;
    }[];
    for (const f of findings)
      err(`  ${f.code} (${f.recordId}${f.field !== null ? `, ${f.field}` : ''})\n`);
    return 1;
  };

  try {
    switch (sub) {
      case 'show': {
        const subjectId = required(values, 'subject-id');
        if (!UUID_SHAPE.test(subjectId))
          throw new UsageError('--subject-id must be a lower-case UUID.');
        return await withPoolOf(readonlyPool, async (pool) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const graph = await loadSubjectGraph(client, subjectId, {
              asOf: await databaseNow(client),
            });
            if (graph === null)
              return refuse('SUBJECT_NOT_FOUND', `no discovery subject ${subjectId}.`);
            const model = deriveSubjectReadModel(graph);
            out(json ? envelope('show', 'READ', { data: model }) : renderReadModel(model));
            return 0;
          } finally {
            await client.query('ROLLBACK').catch(() => undefined);
            client.release();
          }
        });
      }
      case 'list': {
        const limitText = str(values, 'limit');
        const limit = limitText === undefined ? LIST_DEFAULT_LIMIT : Number(limitText);
        if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX_LIMIT) {
          throw new UsageError(`--limit must be an integer from 1 to ${LIST_MAX_LIMIT}.`);
        }
        const after = str(values, 'after') ?? null;
        if (after !== null && !UUID_SHAPE.test(after)) {
          throw new UsageError('--after must be a lower-case UUID.');
        }
        return await withPoolOf(readonlyPool, async (pool) => {
          const client = await pool.connect();
          try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const rows = await loadSubjectPage(client, limit, after);
            const page = summariseSubjectPage(rows, await databaseNow(client), limit);
            out(json ? envelope('list', 'READ', { data: page }) : renderList(page));
            return 0;
          } finally {
            await client.query('ROLLBACK').catch(() => undefined);
            client.release();
          }
        });
      }
      case 'review': {
        if (execute) {
          // Before any connection: there is no trusted reviewer to attribute a decision to.
          return refuse(
            REVIEWER_TRUST_PRIMITIVE_ABSENT,
            'authoritative review execution is disabled: the Engine has no trusted reviewer ' +
              'identity, and no option can supply one. Run without --execute for a preview.',
          );
        }
        const outcome = required(values, 'outcome');
        if (!(REVIEW_OUTCOMES as readonly string[]).includes(outcome)) {
          throw new UsageError(`--outcome must be one of ${REVIEW_OUTCOMES.join(', ')}.`);
        }
        const head = required(values, 'expect-head');
        const request = {
          target: reviewTargetOf(values),
          outcome: outcome as ReviewOutcome,
          expectedHeadReviewId: head === 'none' ? null : head,
          expectedStateDigest: required(values, 'expect-state'),
          reason: str(values, 'reason') ?? null,
        };
        const r = await withPoolOf(readonlyPool, (pool) => planReview(pool, request));
        out(
          json
            ? envelope('review', 'DRY_RUN', {
                executable: false,
                blocker: REVIEWER_TRUST_PRIMITIVE_ABSENT,
                data: r,
              })
            : `PREVIEW ONLY - review execution is disabled (${REVIEWER_TRUST_PRIMITIVE_ABSENT}).\n` +
                renderResult(r),
        );
        return 0;
      }
      case 'propose':
      case 'claim':
      case 'relate': {
        const subjectId = required(values, 'subject-id');
        const provenance = sourceOf(values);
        let plan: (pool: pg.Pool) => Promise<RegistryResult>;
        let exec: (pool: pg.Pool) => Promise<RegistryResult>;
        if (sub === 'propose') {
          const request = {
            subjectId,
            registeredKind: required(values, 'kind') as SubjectKind,
            registrationNote: str(values, 'note') ?? null,
            name: required(values, 'name'),
            nameLanguage: str(values, 'name-language') ?? null,
            provenance,
          };
          plan = (pool) => planPropose(pool, request);
          exec = (pool) => executePropose(pool, request);
        } else if (sub === 'claim') {
          const request = { subjectId, payload: payloadOf(values), provenance };
          plan = (pool) => planClaim(pool, request);
          exec = (pool) => executeClaim(pool, request);
        } else {
          const predicate = required(values, 'predicate');
          if (!(RELATIONSHIP_PREDICATES as readonly string[]).includes(predicate)) {
            throw new UsageError(
              `--predicate must be one of ${RELATIONSHIP_PREDICATES.join(', ')}.`,
            );
          }
          const targetSubject = str(values, 'target-subject-id');
          const targetEche = str(values, 'target-eche-row-key');
          if ((targetSubject === undefined) === (targetEche === undefined)) {
            throw new UsageError(
              'exactly one of --target-subject-id, --target-eche-row-key is required.',
            );
          }
          const target: RelationshipTargetInput =
            targetSubject !== undefined
              ? { targetSubjectId: targetSubject }
              : { targetEcheRowKey: targetEche! };
          const request = {
            subjectId,
            predicate: predicate as RelationshipPredicate,
            target,
            provenance,
          };
          plan = (pool) => planRelate(pool, request);
          exec = (pool) => executeRelate(pool, request);
        }
        const r = execute
          ? await withPoolOf(writerPool, exec)
          : await withPoolOf(readonlyPool, plan);
        out(json ? envelope(sub, r.mode, { data: r }) : renderResult(r));
        return 0;
      }
    }
    return 1;
  } catch (error) {
    if (error instanceof UsageError) return refuse('INPUT_INVALID', error.message);
    if (error instanceof RegistryRefusal) {
      return refuse(error.code, error.detail, {
        findings: error.findings.map((f) => ({
          severity: f.severity,
          code: f.code,
          recordId: f.recordId,
          field: f.field,
        })),
      });
    }
    if (error instanceof SubjectGraphBoundExceeded)
      return refuse('GRAPH_BOUND_EXCEEDED', error.message);
    return refuse('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  }
}
