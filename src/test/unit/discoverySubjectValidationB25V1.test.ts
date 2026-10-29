/**
 * Track B, B2.5-V1 - partition-safe validation findings, WITHOUT a database.
 * One in-memory Queryable answers the B2.2 loader's SELECTs over synthetic
 * rows the way their SQL reads, plus the assembler's own transaction-control
 * statements and the one clock reading. A scripted override can return a holder,
 * source-subject, claim-review or subject-row result no real query would, to
 * reach the partial-graph and inconsistent-result paths.
 *
 * Every record here is a real B2.1 record shape over SYNTHETIC subjects
 * (`.example` sources), validated by the real, unmodified B2.1 validator.
 * Ids are minted in ascending order wherever a test depends on which rows a
 * capped query includes.
 *
 * The B2.1 validator is wrapped by a pass-through recorder (same function,
 * same result) only so that the as-of it RECEIVED can be compared with the
 * one S0 binds (V1-R1).
 *
 * That PostgreSQL keeps one snapshot, that the snapshot exists before the
 * as-of is read, that a commit between BEGIN and the snapshot is visible and
 * not a false finding and that a commit after it is invisible, is proven by
 * src/test/integration/discoverySubjectValidationB25V1.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ValidateModule from '../../orgunits/identity/validate.js';
import { validateIdentityGraph, type IdentityFinding } from '../../orgunits/identity/validate.js';
import { loadSubjectGraph, type Queryable } from '../../orgunits/subjectRegistry/store.js';
import {
  SNAPSHOT_READ_FACTS,
  SubjectSnapshotReadRefusal,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SnapshotValidationReport,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import {
  recordContentDigestOf,
  reproduceSnapshotScopeManifest,
} from '../../orgunits/subjectSnapshot/manifest.js';

/** Every input the real validator received, in order; nothing else changes. */
const validatorInputs = vi.hoisted(() => [] as { asOf: unknown }[]);
vi.mock('../../orgunits/identity/validate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ValidateModule>();
  return {
    ...actual,
    validateIdentityGraph: (input: Parameters<typeof actual.validateIdentityGraph>[0]) => {
      validatorInputs.push(input);
      return actual.validateIdentityGraph(input);
    },
  };
});

/**
 * The transaction's start (BEGIN), and the one clock reading taken once the
 * snapshot existed - the validation as-of. The validator compares instants to
 * the MILLISECOND (Date.parse): these fixtures keep whole-millisecond gaps.
 */
const TX = '2026-10-18T12:00:00.000000Z';
const CLOCK = '2026-10-18T12:00:00.005000Z';
const OBSERVED = '2026-10-01T09:00:00.000000Z';
const STATE = {
  isolation: 'repeatable read',
  read_only: 'on',
  snapshot: '940:940:',
  started: '2026-10-18 12:00:00+00',
};
const PIC = '999400061';
const RULE_VERSION = 'discovery-identity-rules-v1';
const INCOMING_SQL = 'WHERE target_subject_id = $1 AND subject_id <> $1';
const HOLDER_SQL = 'SELECT DISTINCT subject_id FROM discovery_subject_identity_claims';
const SOURCE_SQL = 'FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id LIMIT $2';
const REVIEW_SQL = 'FROM discovery_subject_reviews';
const REFERENCE_SQL = 'SELECT id, review_id, key_id, payload_sha256';
const STATE_SQL = "current_setting('transaction_isolation')";
const CLOCK_SQL = 'clock_timestamp()';

type Row = Record<string, unknown>;
interface Tables {
  subjects: Row[];
  identity: Row[];
  relationships: Row[];
  reviews: Row[];
  organisations: string[];
}

let counter = 0;
/** A fresh lower-case UUID that sorts after every earlier one from this helper. */
const ascendingId = (): string => {
  counter += 1;
  return `33333333-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const provenance = (observedAt = OBSERVED): Row => ({
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-v1.example/unit',
  source_version_ref: null,
  observed_at: observedAt,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'v1-synthetic',
  created_at: OBSERVED,
});
const subjectRow = (id: string, kind = 'UNCERTAIN'): Row => ({
  id,
  registered_kind: kind,
  registered_by_actor_key: 'v1-synthetic',
  registration_note: null,
  created_at: OBSERVED,
});
const claimRow = (subjectId: string, extra: Row = {}, observedAt = OBSERVED): Row => ({
  id: ascendingId(),
  subject_id: subjectId,
  claim_kind: 'NAME',
  name_text: 'Synthetic V1',
  name_language: null,
  claimed_kind: null,
  website_url: null,
  identifier_scheme: null,
  identifier_value: null,
  ...provenance(observedAt),
  ...extra,
});
const picRow = (subjectId: string): Row =>
  claimRow(subjectId, {
    claim_kind: 'EXTERNAL_IDENTIFIER',
    name_text: null,
    identifier_scheme: 'EU_PIC',
    identifier_value: PIC,
  });
const kindRow = (subjectId: string, kind: string): Row =>
  claimRow(subjectId, { claim_kind: 'ENTITY_KIND', name_text: null, claimed_kind: kind });
const relation = (from: string, predicate: string, target: string): Row => ({
  id: ascendingId(),
  subject_id: from,
  predicate,
  target_subject_id: target,
  target_eche_row_key: null,
  ...provenance(),
});
const echeRelation = (from: string, key: string): Row => ({
  ...relation(from, 'OPERATES_AT', from),
  target_subject_id: null,
  target_eche_row_key: key,
});
const reviewOf = (target: Row, outcome = 'CONFIRMED'): Row => ({
  id: ascendingId(),
  reviewed_subject_id: null,
  reviewed_identity_claim_id: null,
  reviewed_relationship_claim_id: null,
  review_outcome: outcome,
  supersedes_review_id: null,
  actor_key: 'v1-synthetic',
  reviewed_at: OBSERVED,
  reason: null,
  created_at: OBSERVED,
  ...target,
});
const reviewTarget = (r: Row): string =>
  r.reviewed_subject_id !== null
    ? `subject:${r.reviewed_subject_id as string}`
    : r.reviewed_identity_claim_id !== null
      ? `identity_claim:${r.reviewed_identity_claim_id as string}`
      : `relationship_claim:${r.reviewed_relationship_claim_id as string}`;
const byId = (a: Row, b: Row) => ((a.id as string) < (b.id as string) ? -1 : 1);

interface Script {
  /** The clock returned by each read of it, in order (the last repeats). */
  readonly clock?: readonly unknown[];
  /** The transaction state returned by each read of it, in order (the last repeats). */
  readonly state?: readonly Row[];
  readonly holders?: (computed: string[]) => unknown[];
  /** Replaces the loader's own subject-row statement's answer. */
  readonly graphSubjects?: (computed: Row[]) => Row[];
  /** Replaces the P1d source-subject statement's answer. */
  readonly sources?: (computed: Row[]) => Row[];
  /** Replaces the P1e incoming-claim review statement's answer. */
  readonly claimReviews?: (computed: Row[]) => Row[];
}

function queryable(t: Tables, script: Script = {}) {
  const log: { sql: string[]; values: unknown[][] } = { sql: [], values: [] };
  let incomingSent = false;
  let clockReads = 0;
  let stateReads = 0;
  const nth = <T>(values: readonly T[], n: number): T => values[Math.min(n, values.length - 1)]!;
  const answer = (sql: string, v: unknown[]): unknown[] => {
    if (sql.includes('no_open_block')) return [{ no_open_block: true }];
    if (sql.startsWith('BEGIN') || sql === 'ROLLBACK') return [];
    if (sql.includes(STATE_SQL)) return [nth(script.state ?? [STATE], (stateReads += 1) - 1)];
    if (sql.includes(CLOCK_SQL))
      return [{ now: nth(script.clock ?? [CLOCK], (clockReads += 1) - 1) }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(sql)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes(INCOMING_SQL)) {
      incomingSent = true;
      return t.relationships
        .filter((r) => r.target_subject_id === v[0] && r.subject_id !== v[0])
        .sort(byId)
        .slice(0, v[1] as number);
    }
    if (sql.includes('FROM discovery_subject_relationship_claims')) {
      const frontier = v[0] as string[];
      return t.relationships.filter(
        (r) =>
          frontier.includes(r.subject_id as string) &&
          (r.subject_id === v[1] || r.predicate === 'PART_OF'),
      );
    }
    if (sql.includes('SELECT DISTINCT identifier_scheme AS scheme')) {
      const pairs = t.identity
        .filter((c) => c.subject_id === v[0] && c.claim_kind === 'EXTERNAL_IDENTIFIER')
        .map((c) => `${c.identifier_scheme as string}|${c.identifier_value as string}`);
      return [...new Set(pairs)].sort().map((p) => {
        const [scheme, value] = p.split('|');
        return { scheme, value };
      });
    }
    if (sql.includes(HOLDER_SQL)) {
      const keys = (v[0] as string[]).map((s, i) => `${s}|${(v[1] as string[])[i]}`);
      const ids = [
        ...new Set(
          t.identity
            .filter(
              (c) =>
                c.claim_kind === 'EXTERNAL_IDENTIFIER' &&
                c.subject_id !== v[2] &&
                keys.includes(`${c.identifier_scheme as string}|${c.identifier_value as string}`),
            )
            .map((c) => c.subject_id as string),
        ),
      ]
        .sort()
        .slice(0, v[3] as number);
      return (script.holders ? script.holders(ids) : ids).map((subject_id) => ({ subject_id }));
    }
    if (sql.includes(SOURCE_SQL)) {
      const rows = t.subjects
        .filter((s) => (v[0] as string[]).includes(s.id as string))
        .sort(byId)
        .slice(0, v[1] as number);
      return script.sources ? script.sources(rows) : rows;
    }
    if (sql.includes('FROM discovery_subjects WHERE id = ANY')) {
      const rows = t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
      return script.graphSubjects ? script.graphSubjects(rows) : rows;
    }
    if (sql.includes('FROM discovery_subject_identity_claims')) {
      return t.identity.filter((c) => (v[0] as string[]).includes(c.subject_id as string));
    }
    if (sql.includes(REVIEW_SQL)) {
      const rows = t.reviews
        .filter((r) => (v[0] as string[]).includes(reviewTarget(r)))
        .sort(byId)
        .slice(0, v[1] as number);
      return incomingSent && script.claimReviews ? script.claimReviews(rows) : rows;
    }
    if (sql.includes('FROM organisations')) {
      return t.organisations
        .filter((k) => (v[0] as string[]).includes(k))
        .sort()
        .map((eche_row_key) => ({ eche_row_key }));
    }
    if (sql.includes('FROM subject_review_environment')) {
      return [{ environment_id: '00000000-0000-4000-8000-0000000000e3' }];
    }
    if (sql.includes(REFERENCE_SQL) || sql.includes('FROM subject_review_attestations')) return [];
    throw new Error(`unscripted statement: ${sql}`);
  };
  const query = (async (text: string, values: unknown[] = []) => {
    log.sql.push(text);
    log.values.push(values);
    return { rows: answer(text, values) };
  }) as unknown as Queryable['query'];
  return { q: { query } as Queryable, log };
}

function connectionSource(t: Tables, script: Script = {}) {
  const { q, log } = queryable(t, script);
  const releases: unknown[] = [];
  let connects = 0;
  const source: SnapshotReadConnectionSource = {
    connect: async () => {
      connects += 1;
      return {
        query: q.query as unknown as SnapshotReadConnection['query'],
        release: (destroy?: boolean | Error) => void releases.push(destroy),
      };
    },
  };
  return { source, log, releases, connects: () => connects };
}

const empty = (): Tables => ({
  subjects: [],
  identity: [],
  relationships: [],
  reviews: [],
  organisations: [],
});

/** A named focal subject and nothing else. */
function namedFocal(t: Tables = empty()) {
  const focal = ascendingId();
  t.subjects.push(subjectRow(focal));
  t.identity.push(claimRow(focal));
  return { focal, t };
}

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

async function validated(t: Tables, focal: string, script: Script = {}) {
  const c = connectionSource(t, script);
  validatorInputs.length = 0;
  const result = built(await assembleSubjectSnapshotScope(c.source, focal, { validation: 'RUN' }));
  return {
    result,
    report: result.validation!,
    m: result.manifest,
    c,
    received: [...validatorInputs],
  };
}

beforeEach(() => {
  validatorInputs.length = 0;
});

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code).sort();
const withheld = (report: SnapshotValidationReport) => report.withheld.diagnostics;
const findingKey = (f: IdentityFinding) => `${f.severity}|${f.code}|${f.recordId}|${f.field}`;

/** The real validator over EVERY stored record of `t` - the full graph no read ever holds. */
function fullWorldValidation(t: Tables, asOf = CLOCK) {
  const rel = (r: Row) => ({
    id: r.id as string,
    subjectId: r.subject_id as string,
    predicate: r.predicate as string,
    targetSubjectId: r.target_subject_id as string | null,
    targetEcheRowKey: r.target_eche_row_key as string | null,
    ...prov(r),
  });
  const prov = (r: Row) => ({
    sourceType: r.source_type as string,
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: r.source_url as string,
    sourceVersionRef: null,
    observedAt: r.observed_at as string,
    claimBasis: r.claim_basis as string,
    recordedByActorKey: r.recorded_by_actor_key as string,
  });
  return validateIdentityGraph({
    subjects: t.subjects.map((s) => ({
      id: s.id as string,
      registeredKind: s.registered_kind as string,
      registeredByActorKey: s.registered_by_actor_key as string,
      registrationNote: null,
    })),
    identityClaims: t.identity.map((c) => ({
      id: c.id as string,
      subjectId: c.subject_id as string,
      claimKind: c.claim_kind as string,
      nameText: c.name_text as string | null,
      nameLanguage: c.name_language as string | null,
      claimedKind: c.claimed_kind as string | null,
      websiteUrl: c.website_url as string | null,
      identifierScheme: c.identifier_scheme as string | null,
      identifierValue: c.identifier_value as string | null,
      ...prov(c),
    })),
    relationshipClaims: t.relationships.map(rel),
    reviews: t.reviews.map((r) => ({
      id: r.id as string,
      reviewedSubjectId: r.reviewed_subject_id as string | null,
      reviewedIdentityClaimId: r.reviewed_identity_claim_id as string | null,
      reviewedRelationshipClaimId: r.reviewed_relationship_claim_id as string | null,
      reviewOutcome: r.review_outcome as string,
      supersedesReviewId: null,
      actorKey: r.actor_key as string,
      reviewedAt: r.reviewed_at as string,
      reason: null,
    })),
    knownEcheRowKeys: [...t.organisations],
    asOf,
  } as Parameters<typeof validateIdentityGraph>[0]);
}

describe('B2.5-V1: the default read is the P1a-P1e read, statement for statement', () => {
  it('V1-U1: no option, NOT_RUN and any other value send the same statements and build the same manifest', async () => {
    const { focal, t } = namedFocal();
    t.identity.push(picRow(focal));
    const runs = [];
    for (const options of [undefined, { validation: 'NOT_RUN' as const }, { validation: 'run' }]) {
      const c = connectionSource(t);
      const result = built(
        await assembleSubjectSnapshotScope(
          c.source,
          focal,
          options as Parameters<typeof assembleSubjectSnapshotScope>[2],
        ),
      );
      runs.push({ result, sql: c.log.sql, values: c.log.values });
    }
    for (const run of runs) {
      expect(run.sql).toEqual(runs[0]!.sql);
      expect(run.values).toEqual(runs[0]!.values);
      expect(run.result.canonical).toBe(runs[0]!.result.canonical);
      expect(run.result.read).toBe(SNAPSHOT_READ_FACTS);
      expect('validation' in run.result).toBe(false);
      expect(run.sql.filter((s) => s.includes(CLOCK_SQL))).toHaveLength(1);
      expect(run.result.input.findings).toEqual([]);
      expect(run.result.input.validation.execution).toBe('NOT_RUN');
      expect(run.result.input.validation.ruleVersion).toBeNull();
      // The default as-of is still the post-snapshot clock, exactly as before.
      expect(run.result.input.validation.asOf).toBe(CLOCK);
    }
    expect(runs[0]!.result.manifest.scope.categories.RECORD_SCOPED_FINDINGS).toBe('UNKNOWN');
    expect(SNAPSHOT_READ_FACTS.loaderLimitations).toContain('VALIDATOR_NOT_RUN');
    // The default read never reaches the validator.
    expect(validatorInputs).toEqual([]);
  });
});

describe('B2.5-V1: the validated read keeps the P1a transaction and fixes one as-of', () => {
  it('V1-U2: exactly the default statements: the snapshot is taken, then the clock is read once, then the loader runs', async () => {
    const { focal, t } = namedFocal();
    const plain = connectionSource(t);
    await assembleSubjectSnapshotScope(plain.source, focal);
    const { c } = await validated(t, focal);
    expect(c.connects()).toBe(1);
    expect(c.releases).toEqual([undefined]);
    // No second connection, transaction or instant: the very same statements and parameters.
    expect(c.log.sql).toEqual(plain.log.sql);
    expect(c.log.values).toEqual(plain.log.values);
    expect(c.log.sql[0]).toMatch(/no_open_block/);
    expect(c.log.sql[1]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // REPEATABLE READ takes its snapshot at the first statement after BEGIN ...
    expect(c.log.sql[2]).toContain(STATE_SQL);
    expect(c.log.sql[2]).toContain('pg_current_snapshot()');
    // ... and only then is the clock read: once, before any table is read.
    const clockAt = c.log.sql.map((s, i) => (s.includes(CLOCK_SQL) ? i : -1)).filter((i) => i >= 0);
    expect(clockAt).toEqual([3]);
    expect(c.log.sql[4]).toMatch(/FROM discovery_subjects WHERE id = \$1/);
    // The transaction's own instants appear only in the P1a probe and the two state checks.
    const stamped = c.log.sql
      .map((s, i) => (/transaction_timestamp|statement_timestamp/.test(s) ? i : -1))
      .filter((i) => i >= 0);
    expect(stamped).toEqual([0, 2, c.log.sql.length - 2]);
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.log.sql.at(-2)).toContain(STATE_SQL);
    expect(c.log.sql.filter((s) => /\b(INSERT|UPDATE|DELETE|COMMIT)\b/.test(s))).toEqual([]);
  });

  it('V1-U3: the as-of is the one post-snapshot clock reading, never the transaction start; validator, input and manifest agree', async () => {
    const { focal, t } = namedFocal();
    const { result, report, m, received } = await validated(t, focal);
    expect(received.map((r) => r.asOf)).toEqual([CLOCK]);
    expect(result.input.validation.asOf).toBe(CLOCK);
    expect(report.asOf).toBe(CLOCK);
    expect('snapshotClock' in report).toBe(false);
    expect(
      m.validation.sourceGlobals.find((g) => g.key === 'VALIDATION_AS_OF')!.contentDigest,
    ).toBe(recordContentDigestOf('SOURCE_GLOBAL', { key: 'VALIDATION_AS_OF', asOf: CLOCK }));
    expect(result.read.validationAsOf).toBe(
      'ONE_DATABASE_CLOCK_READING_ON_THE_READ_CONNECTION_AFTER_ITS_SNAPSHOT_EXISTED_THE_LOADERS_OWN',
    );
    expect((result.read as Record<string, unknown>)['validationAsOfMeaning']).toBe(
      'VALIDATION_INPUT_CONTENT_BOUND_NOT_A_DURABLE_SOURCE_REVISION_NOT_A_FRESHNESS_GUARANTEE',
    );
    expect(result.read.durableSourceRevision).toBe('NONE');
    expect(m.states.sourceFreshness).toBe('NOT_PROVEN');
    // Rebinding a different instant - the transaction start included - is a different manifest.
    const moved = { ...result.input, validation: { ...result.input.validation, asOf: TX } };
    expect(reproduceSnapshotScopeManifest(result.input, m)).toBe('REPRODUCED');
    expect(reproduceSnapshotScopeManifest(moved, m)).toBe('NOT_REPRODUCED');
  });

  it('V1-U4: the as-of is read once and stays fixed for the assembly; a changed snapshot is refused and rolled back', async () => {
    const { focal, t } = namedFocal();
    t.identity.push(
      claimRow(focal, { name_text: 'Synthetic V1 Later' }, '2026-10-18T12:00:08.000000Z'),
    );
    // A clock that would have moved on, had anything read it again.
    const later = '2026-10-18T12:00:09.000000Z';
    const { c, result, report, m, received } = await validated(t, focal, { clock: [CLOCK, later] });
    expect(c.log.sql.filter((s) => s.includes(CLOCK_SQL))).toHaveLength(1);
    expect(received.map((r) => r.asOf)).toEqual([CLOCK]);
    expect([result.input.validation.asOf, report.asOf]).toEqual([CLOCK, CLOCK]);
    // Judged against the first and only reading, the 12:00:08 claim is after the as-of.
    expect(m.validation.findings.map((f) => f.code)).toEqual(['TIMESTAMP_AFTER_AS_OF']);
    expect(JSON.stringify(result)).not.toContain(later);

    const moved = { ...STATE, snapshot: '940:941:' };
    const d = connectionSource(t, { state: [STATE, moved] });
    validatorInputs.length = 0;
    const error = await assembleSubjectSnapshotScope(d.source, focal, {
      validation: 'RUN',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SubjectSnapshotReadRefusal);
    expect((error as SubjectSnapshotReadRefusal).code).toBe('TRANSACTION_SNAPSHOT_CHANGED');
    expect(d.log.sql.at(-1)).toBe('ROLLBACK');
    expect(d.releases).toEqual([undefined]);
    expect(validatorInputs).toEqual([]);
  });

  it('V1-U5: a missing subject is SUBJECT_NOT_FOUND, with the validated read facts', async () => {
    const c = connectionSource(empty());
    const result = await assembleSubjectSnapshotScope(c.source, ascendingId(), {
      validation: 'RUN',
    });
    expect(result.outcome).toBe('SUBJECT_NOT_FOUND');
    expect('validation' in result.read).toBe(true);
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
  });
});

describe('B2.5-V1: rule version and validation-input binding', () => {
  it('V1-U6: the accepted rule version, stated as S0 execution vocabulary, never verified', async () => {
    const { focal, t } = namedFocal();
    const { result, m } = await validated(t, focal);
    expect(result.input.validation.ruleVersion).toBe(RULE_VERSION);
    expect(result.input.validation.execution).toBe('CALLER_ASSERTED_RAN');
    expect(m.validation.ruleVersion).toBe(RULE_VERSION);
    expect(m.validation.execution).toBe('CALLER_ASSERTED_RAN');
    expect(m.validation.executionVerification).toBe('NOT_VERIFIED');
    expect(m.validation.unavailableInputs).not.toContain('VALIDATOR_RULE_VERSION');
    expect(m.validation.unavailableInputs).not.toContain('VALIDATION_AS_OF');
    expect(m.scope.categories.VALIDATION_INPUTS).toBe('REPRESENTED');
    expect(m.scope.categories.SOURCE_GLOBALS).toBe('INCOMPLETE');
  });

  it('V1-U7: the published findings are exactly the validator over the bound input, filtered by partition', async () => {
    const { focal, t } = namedFocal();
    const source = ascendingId();
    t.subjects.push(subjectRow(source, 'NETWORK_LOCAL_CHAPTER'));
    t.relationships.push(relation(source, 'AFFILIATED_WITH', focal));
    t.identity.push(
      kindRow(focal, 'ORGANISATION_NETWORK'),
      kindRow(focal, 'INDEPENDENT_COMMUNITY'),
    );
    const { result, report, m } = await validated(t, focal);
    const records = result.input.records;
    const rerun = validateIdentityGraph({
      subjects: records.subjects,
      identityClaims: records.identityClaims,
      relationshipClaims: records.relationshipClaims,
      reviews: records.reviews,
      knownEcheRowKeys: result.input.validation.echeRowKeyState!.presentKeys,
      asOf: result.input.validation.asOf!,
    } as Parameters<typeof validateIdentityGraph>[0]);
    const partitionOf = new Map(
      [...m.validation.findings, ...withheld(report).map((d) => d.finding)].map((f) => [
        findingKey(f as IdentityFinding),
        f,
      ]),
    );
    expect(rerun.findings.map(findingKey).sort()).toEqual([...partitionOf.keys()].sort());
    expect(m.validation.findings.map((f) => findingKey(f as IdentityFinding)).sort()).toEqual(
      rerun.findings
        .filter((f) => f.recordId === 'input' || f.subjectId === focal)
        .map(findingKey)
        .sort(),
    );
    expect(codes(m.validation.findings)).toEqual(['ENTITY_KIND_CONFLICT']);
  });

  it('V1-U8: the validated read facts replace VALIDATOR_NOT_RUN and promote nothing', async () => {
    const { focal, t } = namedFocal();
    const { result } = await validated(t, focal);
    const facts = result.read as typeof result.read & { validation: Record<string, unknown> };
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.validation)).toBe(true);
    expect(facts.loaderLimitations).not.toContain('VALIDATOR_NOT_RUN');
    expect([...facts.loaderLimitations]).toEqual(
      SNAPSHOT_READ_FACTS.loaderLimitations.filter((l) => l !== 'VALIDATOR_NOT_RUN'),
    );
    expect(facts.validation).toMatchObject({
      ruleVersion: RULE_VERSION,
      publishedPartitions: ['INPUT', 'FOCAL_RECORD'],
      structuralValidity: 'NOT_DERIVED_NOT_STATED',
      absence: 'NO_PUBLISHED_FINDING_IS_NOT_PROOF_THAT_ANY_SUBJECT_IS_VALID',
      authority: 'NONE_NO_IDENTITY_REVIEW_TRUST_PROTECTION_OR_OPERATIONAL_PROMOTION',
    });
    expect(facts.durableSourceRevision).toBe('NONE');
    expect(facts.manifestBinding).toBe('THESE_FACTS_ARE_NOT_COMMITTED_BY_THE_MANIFEST_DIGEST');
  });
});

describe('B2.5-V1: INPUT findings', () => {
  it('V1-U9: a present but malformed ECHE key is an INPUT finding, published, and its focal consequence too', async () => {
    const { focal, t } = namedFocal();
    const bad = 'f paris-bad|123';
    t.organisations.push(bad);
    const claim = echeRelation(focal, bad);
    t.relationships.push(claim);
    const { m } = await validated(t, focal);
    expect(m.validation.findings.map((f) => [f.partition, f.code, f.recordId])).toEqual([
      ['INPUT', 'ECHE_ROW_KEY_INVALID', 'input'],
      ['FOCAL_RECORD', 'RELATIONSHIP_TARGET_UNKNOWN', claim.id],
    ]);
    expect(m.scope.categories.INPUT_SCOPED_FINDINGS).toBe('REPRESENTED');
    expect(m.validation.sourceGlobals.find((g) => g.key === 'ECHE_ROW_KEY_EXISTENCE')!.status).toBe(
      'SUPPLIED',
    );
  });

  it('V1-U10: a well-shaped but impossible instant is an INPUT AS_OF_INVALID finding; a malformed one is refused by S0', async () => {
    const { focal, t } = namedFocal();
    const impossible = '2026-13-45T25:61:61.000000Z';
    const { m, report } = await validated(t, focal, { clock: [impossible] });
    expect(m.validation.findings.map((f) => [f.partition, f.code, f.field])).toEqual([
      ['INPUT', 'AS_OF_INVALID', 'asOf'],
    ]);
    expect(report.publishedFindingCount).toEqual({ input: 1, focalRecord: 0 });

    const c = connectionSource(t, { clock: ['not-an-instant'] });
    const refused = await assembleSubjectSnapshotScope(c.source, focal, { validation: 'RUN' });
    expect(refused.outcome).toBe('REFUSED');
    if (refused.outcome === 'REFUSED') {
      expect(refused.code).toBe('SOURCE_GLOBAL_SHAPE_UNSUPPORTED');
      expect('validation' in refused.read).toBe(true);
    }
  });
});

describe('B2.5-V1: FOCAL_RECORD findings and their dependencies', () => {
  it('V1-U11: a valid focal record publishes nothing, with every dependency REPRESENTED', async () => {
    const { focal, t } = namedFocal();
    const { m, report } = await validated(t, focal);
    expect(m.validation.findings).toEqual([]);
    expect(m.scope.categories).toMatchObject({
      INPUT_SCOPED_FINDINGS: 'REPRESENTED',
      RECORD_SCOPED_FINDINGS: 'REPRESENTED',
      NEIGHBOUR_RECORD_FINDINGS: 'INCOMPLETE',
      VALIDATION_INPUTS: 'REPRESENTED',
    });
    expect(report.focalCoverageGaps).toEqual([]);
    // Still not a statement that anything is valid or complete.
    expect(m.scope.declaredGaps).toContain('NEIGHBOUR_RECORD_FINDINGS');
    expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
    expect(m.limitations.emptyFindings).toBe(
      'NOT_PROOF_THAT_VALIDATORS_RAN_OVER_COMPLETE_SOURCE_DATA',
    );
    expect(JSON.stringify(report)).not.toMatch(/structurallyValid|"VALID"/);
  });

  it('V1-U12: an invalid focal record publishes every focal finding', async () => {
    const focal = ascendingId();
    const t = empty();
    t.subjects.push(subjectRow(focal));
    const future = claimRow(
      focal,
      { claim_kind: 'ENTITY_KIND', name_text: null, claimed_kind: 'ORGANISATION_NETWORK' },
      '2026-10-18T13:00:00.000000Z',
    );
    t.identity.push(future, kindRow(focal, 'INDEPENDENT_COMMUNITY'));
    const { m } = await validated(t, focal);
    expect(m.validation.findings.map((f) => [f.partition, f.code]).sort()).toEqual([
      ['FOCAL_RECORD', 'ENTITY_KIND_CONFLICT'],
      ['FOCAL_RECORD', 'SUBJECT_WITHOUT_NAME_CLAIM'],
      ['FOCAL_RECORD', 'TIMESTAMP_AFTER_AS_OF'],
    ]);
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('REPRESENTED');
  });

  it('V1-U13: with EXHAUSTIVE holders the focal SHARED_EXTERNAL_IDENTIFIER is published, the holder side withheld', async () => {
    const { focal, t } = namedFocal();
    const holder = ascendingId();
    t.subjects.push(subjectRow(holder));
    const focalPic = picRow(focal);
    const holderPic = picRow(holder);
    t.identity.push(focalPic, holderPic, claimRow(holder));
    const { m, report } = await validated(t, focal);
    expect(m.scope.sharedIdentifierHolders.enumeration).toBe('EXHAUSTIVE_AS_DECLARED');
    expect(m.validation.findings.map((f) => [f.code, f.recordId])).toEqual([
      ['SHARED_EXTERNAL_IDENTIFIER', focalPic.id],
    ]);
    expect(withheld(report).map((d) => [d.reason, d.finding.code, d.finding.recordId])).toEqual([
      ['NEIGHBOUR_RECORD_PARTIAL_GRAPH', 'SHARED_EXTERNAL_IDENTIFIER', holderPic.id],
    ]);
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('REPRESENTED');
  });

  it('V1-U14: with TRUNCATED holders a missing focal finding is never certified (a real false negative)', async () => {
    const { focal, t } = namedFocal();
    const focalPic = picRow(focal);
    t.identity.push(focalPic);
    // 21 holders: the 20 the capped query includes all have a REJECTED PIC claim;
    // only the 21st - never loaded - holds it live.
    for (let i = 0; i < 21; i += 1) {
      const holder = ascendingId();
      t.subjects.push(subjectRow(holder));
      const pic = picRow(holder);
      t.identity.push(pic, claimRow(holder));
      if (i < 20) t.reviews.push(reviewOf({ reviewed_identity_claim_id: pic.id }, 'REJECTED'));
    }
    const { m, report } = await validated(t, focal);
    expect(m.scope.sharedIdentifierHolders.enumeration).toBe('TRUNCATED');
    expect(codes(m.validation.findings)).not.toContain('SHARED_EXTERNAL_IDENTIFIER');
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('INCOMPLETE');
    expect(report.focalCoverage).toBe('INCOMPLETE');
    expect(report.focalCoverageGaps).toEqual(['SHARED_IDENTIFIER_HOLDERS_INCOMPLETE']);
    // Over every stored record the focal claim IS shared: the read's silence was a false negative.
    expect(
      fullWorldValidation(t).findings.some(
        (f) => f.code === 'SHARED_EXTERNAL_IDENTIFIER' && f.recordId === focalPic.id,
      ),
    ).toBe(true);
  });

  it('V1-U15: an UNKNOWN holder enumeration leaves focal coverage UNKNOWN', async () => {
    const { focal, t } = namedFocal();
    const holder = ascendingId();
    t.subjects.push(subjectRow(holder));
    t.identity.push(picRow(focal), picRow(holder));
    const { m, report } = await validated(t, focal, { holders: (ids) => [...ids, ...ids] });
    expect(m.scope.sharedIdentifierHolders.enumeration).toBe('UNKNOWN');
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('UNKNOWN');
    expect(report.focalCoverageGaps).toEqual(['SHARED_IDENTIFIER_HOLDERS_UNKNOWN']);
  });

  it('V1-U16: a focal instant after the transaction start but not after the as-of is no finding; one after it is published; nothing is withheld for timing', async () => {
    for (const [instant, expected] of [
      // After BEGIN, before the post-snapshot clock: what a commit racing the snapshot carries.
      ['2026-10-18T12:00:00.002000Z', 'NO_FINDING'],
      [CLOCK, 'NO_FINDING'],
      // Inside the as-of's own millisecond: not after it to the validator.
      ['2026-10-18T12:00:00.005400Z', 'NO_FINDING'],
      [TX, 'NO_FINDING'],
      ['2026-10-18T12:00:00.006000Z', 'PUBLISHED'],
    ] as const) {
      const { focal, t } = namedFocal();
      const claim = claimRow(focal, { name_text: 'Synthetic V1 Alternate' }, instant);
      t.identity.push(claim);
      const { m, report, received } = await validated(t, focal);
      expect(
        received.map((r) => r.asOf),
        instant,
      ).toEqual([CLOCK]);
      const published = m.validation.findings.filter((f) => f.code === 'TIMESTAMP_AFTER_AS_OF');
      expect(
        published.map((f) => f.recordId),
        instant,
      ).toEqual(expected === 'PUBLISHED' ? [claim.id] : []);
      expect(
        withheld(report).map((d) => d.finding.code),
        instant,
      ).not.toContain('TIMESTAMP_AFTER_AS_OF');
      expect(m.scope.categories.RECORD_SCOPED_FINDINGS, instant).toBe('REPRESENTED');
      expect(report.focalCoverageGaps, instant).toEqual([]);
    }
  });
});

describe('B2.5-V1: NEIGHBOUR and UNSUPPLIED diagnostics are never published', () => {
  it('V1-U17: a P1d row-only source gets a false SUBJECT_WITHOUT_NAME_CLAIM, withheld', async () => {
    const { focal, t } = namedFocal();
    const source = ascendingId();
    t.subjects.push(subjectRow(source, 'NETWORK_LOCAL_CHAPTER'));
    t.identity.push(claimRow(source, { name_text: 'Synthetic Source With A Name' }));
    const claim = relation(source, 'AFFILIATED_WITH', focal);
    t.relationships.push(claim);
    const { result, m, report } = await validated(t, focal);
    expect(result.incomingClaimSourceSubjects.outcome).toBe('EVERY_REQUESTED_ROW_READ');
    expect(withheld(report).map((d) => [d.reason, d.finding.code, d.finding.recordId])).toEqual(
      expect.arrayContaining([
        ['NEIGHBOUR_RECORD_PARTIAL_GRAPH', 'SUBJECT_WITHOUT_NAME_CLAIM', source],
        ['NEIGHBOUR_RECORD_PARTIAL_GRAPH', 'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED', claim.id],
      ]),
    );
    expect(m.validation.findings).toEqual([]);
    expect(m.scope.categories.NEIGHBOUR_RECORD_FINDINGS).toBe('INCOMPLETE');
    // The source's OWN full graph has a name claim: the diagnostic was false.
    const sourceGraph = (await loadSubjectGraph(queryable(t).q, source, { asOf: TX }))!;
    expect(
      validateIdentityGraph(sourceGraph.input).findings.some(
        (f) => f.code === 'SUBJECT_WITHOUT_NAME_CLAIM' && f.recordId === source,
      ),
    ).toBe(false);
  });

  it('V1-U18: an unread incoming source subject is an unknown reference, withheld', async () => {
    const { focal, t } = namedFocal();
    const source = ascendingId();
    t.subjects.push(subjectRow(source));
    const claim = relation(source, 'AFFILIATED_WITH', focal);
    t.relationships.push(claim);
    const { result, m, report } = await validated(t, focal, { sources: () => [] });
    expect(result.incomingClaimSourceSubjects.unreadSubjectIds).toEqual([source]);
    expect(withheld(report).map((d) => [d.partition, d.finding.code, d.finding.recordId])).toEqual(
      expect.arrayContaining([['NEIGHBOUR_RECORD', 'SUBJECT_REFERENCE_UNKNOWN', claim.id]]),
    );
    expect(codes(m.validation.findings)).toEqual([]);
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('REPRESENTED');
  });

  it('V1-U19: a holder’s unloaded relationships hide its real conflict (a neighbour false negative)', async () => {
    const { focal, t } = namedFocal();
    const holder = ascendingId();
    const [a, b] = [ascendingId(), ascendingId()];
    t.subjects.push(
      subjectRow(holder),
      subjectRow(a, 'ORGANISATION_NETWORK'),
      subjectRow(b, 'ORGANISATION_NETWORK'),
    );
    t.identity.push(picRow(focal), picRow(holder), claimRow(holder), claimRow(a), claimRow(b));
    t.relationships.push(relation(holder, 'PART_OF', a), relation(holder, 'PART_OF', b));
    const { m, report } = await validated(t, focal);
    const all = [...m.validation.findings, ...withheld(report).map((d) => d.finding)];
    expect(all.some((f) => f.code === 'STRUCTURAL_PARENT_CONFLICT')).toBe(false);
    expect(m.scope.categories.NEIGHBOUR_RECORD_FINDINGS).toBe('INCOMPLETE');
    expect(
      fullWorldValidation(t).findings.some(
        (f) => f.code === 'STRUCTURAL_PARENT_CONFLICT' && f.recordId === holder,
      ),
    ).toBe(true);
  });

  it('V1-U20: incoming reviews read or not change only the withheld diagnostics', async () => {
    const { focal, t } = namedFocal();
    const source = ascendingId();
    t.subjects.push(subjectRow(source));
    const claim = relation(source, 'PART_OF', focal);
    t.relationships.push(claim);
    t.reviews.push(reviewOf({ reviewed_relationship_claim_id: claim.id }, 'REJECTED'));
    const read = await validated(t, focal);
    const unread = await validated(t, focal, {
      // A review row targeting a subject is never a claim review: the read is UNKNOWN.
      claimReviews: (rows) => [...rows, reviewOf({ reviewed_subject_id: source })],
    });
    expect(read.result.incomingClaimReviews.outcome).toBe('EVERY_MATCHING_ROW_READ');
    expect(unread.result.incomingClaimReviews.outcome).toBe('UNKNOWN');
    const unresolved = (r: typeof read) =>
      withheld(r.report).some(
        (d) =>
          d.finding.code === 'RELATIONSHIP_TARGET_IDENTITY_UNRESOLVED' &&
          d.finding.recordId === claim.id,
      );
    expect(unresolved(read)).toBe(false);
    expect(unresolved(unread)).toBe(true);
    expect(read.result.input.findings).toEqual(unread.result.input.findings);
    expect(read.m.scope.categories.RECORD_SCOPED_FINDINGS).toBe(
      unread.m.scope.categories.RECORD_SCOPED_FINDINGS,
    );
    expect(read.m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
  });
});

describe('B2.5-V1: every partition, as S0 derives it', () => {
  it('V1-U21: INPUT, FOCAL, NEIGHBOUR and UNSUPPLIED in one read; only the first two reach S0', async () => {
    const { focal, t } = namedFocal();
    // An inconsistent loader result: the focal PART_OF target X is not returned
    // as a subject row (the real foreign keys make this impossible), though its
    // own PART_OF claim back to the focal subject is.
    const x = ascendingId();
    const y = ascendingId();
    t.subjects.push(subjectRow(x), subjectRow(y));
    const out = relation(focal, 'PART_OF', x);
    const back = relation(x, 'PART_OF', focal);
    const fromY = relation(y, 'AFFILIATED_WITH', focal);
    const bad = 'f lowercase|7';
    t.organisations.push(bad);
    t.relationships.push(out, back, fromY, echeRelation(focal, bad));
    const { m, report } = await validated(t, focal, {
      graphSubjects: (rows) => rows.filter((r) => r.id !== x),
      sources: () => [],
    });
    const byPartition = (p: string) =>
      [
        ...m.validation.findings.filter((f) => f.partition === p),
        ...withheld(report).filter((d) => d.partition === p),
      ].length;
    for (const p of ['INPUT', 'FOCAL_RECORD', 'NEIGHBOUR_RECORD', 'UNSUPPLIED_RECORD']) {
      expect(byPartition(p), p).toBeGreaterThan(0);
    }
    expect(new Set(m.validation.findings.map((f) => f.partition))).toEqual(
      new Set(['INPUT', 'FOCAL_RECORD']),
    );
    expect(withheld(report).find((d) => d.partition === 'UNSUPPLIED_RECORD')).toMatchObject({
      reason: 'UNSUPPLIED_RECORD',
      finding: { code: 'STRUCTURAL_CYCLE_CLAIMED', recordId: x },
    });
    // A loader reference the result does not supply forbids any focal coverage claim.
    expect(m.scope.categories.RECORD_SCOPED_FINDINGS).toBe('UNKNOWN');
    expect(report.focalCoverageGaps).toContain('LOADER_GRAPH_REFERENCE_NOT_SUPPLIED');
    expect(m.omissions.map((o) => o.code)).toContain('RELATIONSHIP_TARGET_SUBJECT_NOT_SUPPLIED');
    expect(m.omissions.map((o) => o.code)).not.toContain('FINDING_RECORD_NOT_SUPPLIED');
  });
});

describe('B2.5-V1: no authority is promoted', () => {
  it('V1-U22: permissions stay NONE, protection unconsulted, nothing verified, no validity verdict', async () => {
    const { focal, t } = namedFocal();
    t.reviews.push(reviewOf({ reviewed_subject_id: focal }));
    const { result, m } = await validated(t, focal);
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(m.scope.categories.PROTECTION_STATUS).toBe('UNKNOWN');
    expect(m.states).toMatchObject({
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    expect(m.canonicalIssuer).toEqual({ producerMayIssue: 'NONE', identifiersIssuedHere: 'NONE' });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(
      /structurallyValid|identityReview|reviewedKind|SAME_ACTOR|"(cand|chn|opp):|GRANTED|ELIGIBLE|"AUTHENTICATED"/,
    );
    expect(Object.keys(result).sort()).toEqual(
      [
        'canonical',
        'incomingClaimReviews',
        'incomingClaimSourceSubjects',
        'input',
        'manifest',
        'outcome',
        'read',
        'validation',
      ].sort(),
    );
  });
});
