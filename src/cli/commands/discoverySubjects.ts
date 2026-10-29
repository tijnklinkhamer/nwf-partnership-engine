/**
 * `nwf-pe discovery-subjects ...` - THE CONTROLLED DISCOVERY-SUBJECT REGISTRY
 * (Track B, B2.2). For SYNTHETIC / manually registered candidate subjects.
 *
 *   propose  one subject + its first NAME claim, atomically
 *   claim    one identity claim (name, kind, public website, typed identifier)
 *   relate   one relationship claim (to a subject or an ECHE source row)
 *   review   PREVIEW of one review decision; `--prepare` emits its unsigned
 *            OWNER review request; `--execute --envelope` records a SIGNED one
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
 * B2.3 (ADR 0023): `review --execute` takes NOTHING but `--envelope <path>`,
 * an OWNER-signed envelope; target, outcome, head, state and reason all come
 * from the signed payload, never from flags. It is verified against the
 * PINNED trust set before any connection is opened and executed on
 * DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER. While that trust set holds no
 * ACTIVE OWNER key - today - it is refused with REVIEWER_TRUST_PRIMITIVE_ABSENT
 * before the envelope is even read. Signing happens elsewhere, offline
 * (`nwf-pe discovery-subject-review-sign`). Nothing here fetches a URL,
 * resolves a host, calls a model, starts research, scores, or contacts anyone.
 */
import { lstatSync, readFileSync } from 'node:fs';
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
import {
  REVIEWER_TRUST_PRIMITIVE_ABSENT,
  TrustedReviewerContext,
} from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { canonicalJson, type CanonicalValue } from '../../orgunits/subjectReview/canonical.js';
import {
  REVIEW_ENVELOPE_MAX_BYTES,
  ReviewProtocolError,
} from '../../orgunits/subjectReview/protocol.js';
import { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import {
  databaseNow,
  loadSubjectGraph,
  loadSubjectPage,
  SubjectGraphBoundExceeded,
} from '../../orgunits/subjectRegistry/store.js';
import {
  RegistryRefusal,
  appendAttestedReview,
  executeClaim,
  executePropose,
  executeRelate,
  planClaim,
  planPropose,
  planRelate,
  planReview,
  prepareReview,
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
                             --expect-state <digest> [--reason <text>] [--prepare] [--json]
  discovery-subjects review  --execute --envelope <signed-envelope-path> [--json]
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
\`review\` previews a decision; with --prepare it prints the unsigned OWNER review
request (stdout) for offline signing with \`nwf-pe discovery-subject-review-sign\`.
\`review --execute --envelope\` records ONLY an OWNER-signed decision, and is refused
(${REVIEWER_TRUST_PRIMITIVE_ABSENT}) while no OWNER review key is provisioned.
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
    prepare: { type: 'boolean' },
    envelope: { type: 'string' },
    ...WRITE_OPTIONS,
  },
  show: { 'subject-id': { type: 'string' }, ...OUTPUT_OPTIONS },
  list: { limit: { type: 'string' }, after: { type: 'string' }, ...OUTPUT_OPTIONS },
});

/** Injected in tests; production builds pools from the environment. */
export interface DiscoverySubjectsDeps {
  readonly readonlyPool?: () => pg.Pool;
  readonly writerPool?: () => pg.Pool;
  readonly reviewerPool?: () => pg.Pool;
  /** The pinned trust set. Production uses the operational one; only vitest can build another. */
  readonly trust?: ReviewTrustSet;
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

/** The effective (attested) review state, with the recorded head beside it when they differ. */
function reviewLabel(recorded: string, effective: string): string {
  return effective === recorded ? effective : `${effective}; recorded ${recorded}`;
}

function claimLine(c: IdentityClaimView): string {
  const language = c.nameLanguage !== null ? ` (${c.nameLanguage})` : '';
  const head = c.reviewHeadId !== null ? ` head ${c.reviewHeadId}` : '';
  return (
    `    [${reviewLabel(c.review, c.effectiveReview)}] ${c.claimKind} ${JSON.stringify(c.value)}${language}  claim ${c.claimId}${head}\n` +
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
    `  identity review      : ${reviewLabel(s.identityReview, m.effectiveIdentity.identityReview)}${s.identityReviewHeadId !== null ? ` (head ${s.identityReviewHeadId})` : ''}; ` +
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
          `    [${reviewLabel(r.review, r.effectiveReview)}] ${r.predicate} -> ${r.targetKey} ` +
          `(${r.structural ? 'structural' : 'non-structural'}; ${r.assertionBasis})  claim ${r.claimId}` +
          `${r.reviewHeadId !== null ? ` head ${r.reviewHeadId}` : ''}` +
          `${r.targetIdentityReview !== null ? `; target identity ${reviewLabel(r.targetIdentityRecordedReview ?? 'UNREVIEWED', r.targetIdentityReview)}` : ''}\n`,
      )
      .join('') +
    findings('invalid', m.findings.invalid) +
    findings('conflicts', m.findings.conflicts) +
    findings('unresolved', m.findings.unresolved) +
    findings('review signals', m.findings.reviewSignals) +
    `  missing evidence     : ${list(m.missingEvidence)}\n` +
    `  review execution     : ${m.reviewability.authoritativeReviewExecution} (${m.reviewability.blocker ?? 'signed envelope'}); ` +
    `${m.reviewability.unreviewedTargets} unreviewed target(s)\n` +
    `  review attestation   : ${m.reviewAttestation.state}` +
    `${m.reviewAttestation.holdReasons.length > 0 ? ` (${m.reviewAttestation.holdReasons.join(', ')})` : ''}` +
    `${m.reviewAttestation.protectionReevaluationRequired ? '; REQUIRES_PROTECTION_REEVALUATION' : ''}\n` +
    `  withheld review chains: ${list(m.effectiveIdentity.withheldTargets)}\n` +
    `  protection           : structural uncertainty ${list(m.protection.structuralUncertainty)}; ` +
    `re-evaluation ${m.protection.reevaluationRequired ? `REQUIRED (${m.protection.reevaluationTriggers.join(', ')})` : 'not required'}; ` +
    `evidence after attestation ${list(m.protection.evidenceAfterAttestation)}; protected registry not consulted\n` +
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
          `${s.subjectId}  ${s.registeredKind}  review ${reviewLabel(s.identityReview, s.effectiveIdentityReview)} (${s.reviewAuthority})  ` +
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

/** Reads one envelope file: a bounded regular file, never through a symlink. */
function readEnvelopeFile(path: string): Buffer {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new UsageError('--envelope: the file cannot be read.');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new UsageError('--envelope must name a regular file, not a symlink.');
  }
  if (stat.size === 0 || stat.size > REVIEW_ENVELOPE_MAX_BYTES) {
    throw new UsageError(`--envelope must hold 1 to ${REVIEW_ENVELOPE_MAX_BYTES} bytes.`);
  }
  return readFileSync(path);
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
  const reviewerPool =
    deps.reviewerPool ??
    (() => {
      if (env().DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER === undefined) {
        throw new UsageError(
          'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER is not set: review --execute needs a ' +
            'deployment-provisioned login holding nwf_discovery_subject_reviewer ' +
            '(never the owner, a superuser or the writer).',
        );
      }
      return createPool('discovery_subject_reviewer');
    });
  const trust = deps.trust ?? ReviewTrustSet.operational();
  if (!ReviewTrustSet.isTrustSet(trust)) throw new Error('internal: the trust set is not sealed');

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
            const model = deriveSubjectReadModel(graph, trust);
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
            const page = summariseSubjectPage(rows, await databaseNow(client), limit, trust);
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
          // Before any connection - and before the envelope is even read: with no
          // ACTIVE OWNER key pinned, no reviewer can be identified at all.
          if (!trust.hasActiveKey()) {
            return refuse(
              REVIEWER_TRUST_PRIMITIVE_ABSENT,
              'authoritative review execution is disabled: no OWNER review key is provisioned ' +
                'in the pinned trust set, so no signed decision can be verified, and no option ' +
                'can supply one. Run without --execute for a preview.',
            );
          }
          if (values['prepare'] === true) {
            throw new UsageError('--prepare and --execute are separate steps; give one of them.');
          }
          forbidTogether(
            values,
            [
              'subject',
              'identity-claim',
              'relationship-claim',
              'outcome',
              'expect-head',
              'expect-state',
              'reason',
            ],
            'are carried by the signed envelope; give --envelope alone.',
          );
          const path = str(values, 'envelope');
          if (path === undefined) {
            return refuse(
              'SIGNED_ENVELOPE_REQUIRED',
              'review --execute records only an OWNER-signed decision: give --envelope <path>.',
            );
          }
          let verified: VerifiedReviewEnvelope;
          try {
            verified = VerifiedReviewEnvelope.verify(readEnvelopeFile(path), trust);
          } catch (error) {
            if (error instanceof ReviewProtocolError) return refuse(error.code, error.detail);
            throw error;
          }
          const reviewer = TrustedReviewerContext.fromVerifiedEnvelope(verified);
          const r = await withPoolOf(reviewerPool, (pool) =>
            appendAttestedReview(pool, reviewer, trust),
          );
          out(
            json
              ? envelope('review', 'EXECUTED', { attestedBy: verified.keyId, data: r })
              : `OWNER-ATTESTED review recorded (key ${verified.keyId}).\n` + renderResult(r),
          );
          return 0;
        }
        if (str(values, 'envelope') !== undefined) {
          throw new UsageError('--envelope applies to review --execute only.');
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
        const blocker = trust.hasActiveKey()
          ? 'SIGNED_ENVELOPE_REQUIRED'
          : REVIEWER_TRUST_PRIMITIVE_ABSENT;
        if (values['prepare'] === true) {
          const prepared = await withPoolOf(readonlyPool, (pool) =>
            prepareReview(pool, request, trust),
          );
          if (json) {
            out(
              envelope('review', 'DRY_RUN', {
                executable: false,
                blocker,
                request: prepared.request,
                data: prepared.result,
              }),
            );
          } else {
            // stdout carries the request document alone, so `> request.json` works.
            out(`${canonicalJson(prepared.request as unknown as CanonicalValue)}\n`);
            err(
              `PREPARED - nothing was written. Sign the request above offline with ` +
                `\`nwf-pe discovery-subject-review-sign\`, then run review --execute --envelope.\n` +
                `  environment ${prepared.request.intent.environmentId}\n` +
                `  ${request.target.kind} ${request.target.id} -> ${request.outcome}` +
                ` (expected head ${request.expectedHeadReviewId ?? 'none'})\n` +
                `  evidence snapshot ${prepared.request.intent.evidence.snapshotDigest}\n` +
                `  research authority: NOT GRANTED by any review\n`,
            );
          }
          return 0;
        }
        const r = await withPoolOf(readonlyPool, (pool) => planReview(pool, request));
        out(
          json
            ? envelope('review', 'DRY_RUN', { executable: false, blocker, data: r })
            : `PREVIEW ONLY - nothing was written; execution needs a signed OWNER envelope (${blocker}).\n` +
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
