/**
 * Track B, B2.5-P1e - incoming relationship-claim review coverage, WITHOUT a
 * database. One in-memory Queryable answers the B2.2 loader's SELECTs over
 * synthetic rows the way their SQL reads (ORDER BY and LIMIT only when the
 * statement asks for them). A scripted override can return a review or
 * attestation-reference result no real query would - duplicated, unordered,
 * foreign, mistyped, predecessor-less, forked or over its bound - to prove
 * the loader's UNKNOWN guard, its refusal beyond the bound and that the
 * manifest states a chain's shape rather than the loader repairing it.
 *
 * Ids are minted in ascending order where a test depends on which claims the
 * 20-claim cap includes or on the order reviews come back in.
 *
 * That PostgreSQL enforces one linear chain per target, keeps one snapshot
 * and reads the reviews in the same transaction is proven by
 * src/test/integration/discoverySubjectIncomingClaimReviewsB25P1e.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  MAX_GRAPH_ROWS,
  SubjectGraphBoundExceeded,
  loadSubjectGraph,
  type Queryable,
} from '../../orgunits/subjectRegistry/store.js';
import {
  SNAPSHOT_READ_FACTS,
  SCOPE_DECLARATION_BASIS,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import { recordContentDigestOf } from '../../orgunits/subjectSnapshot/manifest.js';

const NOW = '2026-10-18T12:00:00.000000Z';
const OBSERVED = '2026-10-01T09:00:00.000000Z';
const STATE = {
  isolation: 'repeatable read',
  read_only: 'on',
  snapshot: '930:930:',
  started: '2026-10-18 12:00:00.000001+00',
};
const PIC = '999300051';
const INCOMING_SQL = 'WHERE target_subject_id = $1 AND subject_id <> $1';
const HOLDER_SQL = 'SELECT DISTINCT subject_id FROM discovery_subject_identity_claims';
const SOURCE_SQL = 'FROM discovery_subjects WHERE id = ANY($1::uuid[]) ORDER BY id LIMIT $2';
const REVIEW_SQL = 'FROM discovery_subject_reviews';
const REFERENCE_SQL = 'SELECT id, review_id, key_id, payload_sha256';

type Row = Record<string, unknown>;
interface Tables {
  subjects: Row[];
  identity: Row[];
  relationships: Row[];
  reviews: Row[];
  attestations: Row[];
}

let counter = 0;
/** A fresh lower-case UUID that sorts after every earlier one from this helper. */
const ascendingId = (): string => {
  counter += 1;
  return `22222222-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const provenance = {
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-p1e.example/unit',
  source_version_ref: null,
  observed_at: OBSERVED,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'p1e-synthetic',
  created_at: OBSERVED,
};
const subjectRow = (id: string, kind = 'UNCERTAIN'): Row => ({
  id,
  registered_kind: kind,
  registered_by_actor_key: 'p1e-synthetic',
  registration_note: null,
  created_at: OBSERVED,
});
const claimRow = (subjectId: string, extra: Row = {}): Row => ({
  id: randomUUID(),
  subject_id: subjectId,
  claim_kind: 'NAME',
  name_text: 'Synthetic P1e',
  name_language: null,
  claimed_kind: null,
  website_url: null,
  identifier_scheme: null,
  identifier_value: null,
  ...provenance,
  ...extra,
});
const picRow = (subjectId: string): Row =>
  claimRow(subjectId, {
    claim_kind: 'EXTERNAL_IDENTIFIER',
    name_text: null,
    identifier_scheme: 'EU_PIC',
    identifier_value: PIC,
  });
const relation = (
  from: string,
  predicate: string,
  target: string,
  id: string = randomUUID(),
): Row => ({
  id,
  subject_id: from,
  predicate,
  target_subject_id: target,
  target_eche_row_key: null,
  ...provenance,
});
/** A review of one target; `supersedes` makes it the successor of that review. */
const reviewOf = (target: Row, supersedes: Row | null = null, extra: Row = {}): Row => ({
  id: ascendingId(),
  reviewed_subject_id: null,
  reviewed_identity_claim_id: null,
  reviewed_relationship_claim_id: null,
  review_outcome: supersedes === null ? 'CONFIRMED' : 'DISPUTED',
  supersedes_review_id: supersedes === null ? null : supersedes.id,
  actor_key: 'p1e-synthetic',
  reviewed_at: OBSERVED,
  reason: null,
  created_at: OBSERVED,
  ...target,
  ...extra,
});
const claimTarget = (claimId: string): Row => ({ reviewed_relationship_claim_id: claimId });
const attestationOf = (review: Row): Row => ({
  id: ascendingId(),
  review_id: review.id,
  key_id: 'p1e-test-key',
  payload_sha256: 'b'.repeat(64),
  nonce: randomUUID(),
});
const reviewTarget = (r: Row): string =>
  r.reviewed_subject_id !== null
    ? `subject:${r.reviewed_subject_id as string}`
    : r.reviewed_identity_claim_id !== null
      ? `identity_claim:${r.reviewed_identity_claim_id as string}`
      : `relationship_claim:${r.reviewed_relationship_claim_id as string}`;
const byId = (a: Row, b: Row) => ((a.id as string) < (b.id as string) ? -1 : 1);

interface Script {
  /** Replaces the incoming query's answer. */
  readonly incoming?: (computed: Row[]) => unknown[];
  /** Replaces the P1e review statement's answer (the review statement sent after the incoming report). */
  readonly reviews?: (computed: Row[]) => unknown[];
  /** Replaces the P1e attestation-reference statement's answer. */
  readonly references?: (computed: Row[]) => unknown[];
  /** Throws when a statement matches. */
  readonly failOn?: string;
}

/** The loader's SELECTs over `t`, logged in order with their parameters. */
function queryable(t: Tables, script: Script = {}) {
  const log: { sql: string[]; values: unknown[][] } = { sql: [], values: [] };
  let incomingSent = false;
  const answer = (sql: string, v: unknown[]): unknown[] => {
    if (script.failOn !== undefined && sql.includes(script.failOn)) {
      throw new Error('synthetic incoming-claim review query failure');
    }
    if (sql.includes('no_open_block')) return [{ no_open_block: true }];
    if (sql.startsWith('BEGIN') || sql === 'ROLLBACK') return [];
    if (sql.includes("current_setting('transaction_isolation')")) return [STATE];
    if (sql.includes('clock_timestamp()')) return [{ now: NOW }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(sql)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes(INCOMING_SQL)) {
      incomingSent = true;
      const rows = t.relationships
        .filter((r) => r.target_subject_id === v[0] && r.subject_id !== v[0])
        .sort(byId)
        .slice(0, v[1] as number);
      return script.incoming ? script.incoming(rows) : rows;
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
      const ids = new Set(
        t.identity
          .filter(
            (c) =>
              c.claim_kind === 'EXTERNAL_IDENTIFIER' &&
              c.subject_id !== v[2] &&
              keys.includes(`${c.identifier_scheme as string}|${c.identifier_value as string}`),
          )
          .map((c) => c.subject_id as string),
      );
      return [...ids]
        .sort()
        .slice(0, v[3] as number)
        .map((subject_id) => ({ subject_id }));
    }
    if (sql.includes(SOURCE_SQL)) {
      return t.subjects
        .filter((s) => (v[0] as string[]).includes(s.id as string))
        .sort(byId)
        .slice(0, v[1] as number);
    }
    if (sql.includes('FROM discovery_subjects WHERE id = ANY')) {
      return t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
    }
    if (sql.includes('FROM discovery_subject_identity_claims')) {
      return t.identity.filter((c) => (v[0] as string[]).includes(c.subject_id as string));
    }
    if (sql.includes(REVIEW_SQL)) {
      const rows = t.reviews
        .filter((r) => (v[0] as string[]).includes(reviewTarget(r)))
        .sort(byId)
        .slice(0, v[1] as number);
      return incomingSent && script.reviews ? script.reviews(rows) : rows;
    }
    if (sql.includes('FROM organisations')) return [];
    if (sql.includes('FROM subject_review_environment')) {
      return [{ environment_id: '00000000-0000-4000-8000-0000000000e2' }];
    }
    if (sql.includes('SELECT nonce, count(*)::int AS uses')) {
      return (v[0] as string[]).map((nonce) => ({ nonce, uses: 1 }));
    }
    if (sql.includes(REFERENCE_SQL)) {
      const rows = t.attestations
        .filter((a) => (v[0] as string[]).includes(a.review_id as string))
        .sort(byId)
        .slice(0, v[1] as number)
        .map(({ id, review_id, key_id, payload_sha256 }) => ({
          id,
          review_id,
          key_id,
          payload_sha256,
        }));
      return script.references ? script.references(rows) : rows;
    }
    if (sql.includes('FROM subject_review_attestations')) {
      return t.attestations.filter((a) => (v[0] as string[]).includes(a.review_id as string));
    }
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

/**
 * A named focal subject and `n` direct incoming claims (ascending ids) from
 * `sources` source subjects, round-robin, none of which the graph holds.
 */
function world(n: number, sources = n) {
  const focal = ascendingId();
  const sourceIds = Array.from({ length: Math.max(sources, 1) }, () => ascendingId());
  const t: Tables = {
    subjects: [
      subjectRow(focal),
      ...sourceIds.map((id) => subjectRow(id, 'NETWORK_LOCAL_CHAPTER')),
    ],
    identity: [claimRow(focal)],
    relationships: Array.from({ length: n }, (_, i) =>
      relation(sourceIds[i % sourceIds.length]!, 'AFFILIATED_WITH', focal, ascendingId()),
    ),
    reviews: [],
    attestations: [],
  };
  return { focal, sourceIds, claimIds: t.relationships.map((r) => r.id as string), t };
}

/** One incoming claim whose source subject the graph HOLDS (a shared-identifier holder). */
function heldSourceWorld() {
  const focal = ascendingId();
  const holder = ascendingId();
  const claim = relation(holder, 'AFFILIATED_WITH', focal, ascendingId());
  const t: Tables = {
    subjects: [subjectRow(focal), subjectRow(holder)],
    identity: [picRow(focal), picRow(holder)],
    relationships: [claim],
    reviews: [],
    attestations: [],
  };
  return { focal, holder, claimId: claim.id as string, t };
}

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

/** The review statements sent after the incoming report: P1e's, by order. */
function claimReviewStatements(log: { sql: string[]; values: unknown[][] }) {
  const at = log.sql.findIndex((s) => s.includes(INCOMING_SQL));
  return log.sql
    .map((sql, i) => ({ sql, values: log.values[i]!, i }))
    .filter((s) => at >= 0 && s.i > at && s.sql.includes(REVIEW_SQL));
}
const referenceStatements = (log: { sql: string[]; values: unknown[][] }) =>
  log.sql
    .map((sql, i) => ({ sql, values: log.values[i]! }))
    .filter((s) => s.sql.includes(REFERENCE_SQL));

/** A review row as the B2.1 record S0 binds. */
const reviewRecordOf = (r: Row): Record<string, string | null> => ({
  id: r.id as string | null,
  reviewedSubjectId: r.reviewed_subject_id as string | null,
  reviewedIdentityClaimId: r.reviewed_identity_claim_id as string | null,
  reviewedRelationshipClaimId: r.reviewed_relationship_claim_id as string | null,
  reviewOutcome: r.review_outcome as string | null,
  supersedesReviewId: r.supersedes_review_id as string | null,
  actorKey: r.actor_key as string | null,
  reviewedAt: r.reviewed_at as string | null,
  reason: r.reason as string | null,
});

describe('B2.5-P1e loader: the included claims’ stored reviews, by exact target key', () => {
  it('P1e-1: zero included claims send no review or reference statement beyond the graph', async () => {
    const { focal, t } = world(0);
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(claimReviewStatements(c.log)).toEqual([]);
    expect(referenceStatements(c.log)).toEqual([]);
    expect(result.incomingClaimReviews).toEqual({
      outcome: 'NONE_REQUESTED',
      requestedClaimIds: [],
    });
    expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
  });

  it('P1e-2: one review statement over the included claims, sorted, under the loader bound', async () => {
    const { focal, claimIds, t } = world(3, 2);
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const statements = claimReviewStatements(c.log);
    expect(statements).toHaveLength(1);
    expect(statements[0]!.values).toEqual([
      [...claimIds].sort().map((id) => `relationship_claim:${id}`),
      MAX_GRAPH_ROWS + 1,
    ]);
    // With no review stored, no reference statement is needed.
    expect(referenceStatements(c.log)).toEqual([]);
    expect(result.incomingClaimReviews).toEqual({
      outcome: 'EVERY_MATCHING_ROW_READ',
      requestedClaimIds: [...claimIds].sort(),
    });
  });

  it('P1e-3: an empty review history is stated as read, never as an approval', async () => {
    const { focal, holder, claimId, t } = heldSourceWorld();
    void holder;
    const m = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal)).manifest;
    expect(m.reviews.chains).toEqual([]);
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    expect(m.membership.entries.map((e) => e.recordId)).toContain(claimId);
    expect(m.membership.entries.filter((e) => e.recordType === 'REVIEW')).toEqual([]);
    expect(JSON.stringify(m)).not.toMatch(/APPROVED|GRANTED|"CONFIRMED"|ADMITTED/);
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
  });

  it('P1e-4: one review with its attestation is content-bound as stored, never verified', async () => {
    const { focal, claimIds, t } = world(1);
    const review = reviewOf(claimTarget(claimIds[0]!));
    const attestation = attestationOf(review);
    t.reviews.push(review);
    t.attestations.push(attestation);
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const m = result.manifest;
    const entry = m.membership.entries.find((e) => e.recordId === review.id)!;
    expect(entry.recordType).toBe('REVIEW');
    expect(entry.roles).toEqual(['REVIEW_OF_NEIGHBOUR_RECORD']);
    expect(entry.contentDigest).toBe(recordContentDigestOf('REVIEW', reviewRecordOf(review)));
    const ref = m.membership.entries.find((e) => e.recordId === attestation.id)!;
    expect(ref.contentDigest).toBe(
      recordContentDigestOf('REVIEW_ATTESTATION_REFERENCE', {
        id: attestation.id as string,
        reviewId: review.id as string,
        keyId: 'p1e-test-key',
        payloadSha256: 'b'.repeat(64),
      }),
    );
    expect(m.reviews.attestationReferences).toEqual([
      {
        attestationId: attestation.id,
        reviewId: review.id,
        reviewSupplied: true,
        signatureVerification: 'NOT_PERFORMED',
        reviewerTrust: 'NONE_ESTABLISHED',
      },
    ]);
    expect(m.reviews.chains).toEqual([
      {
        targetKey: `relationship_claim:${claimIds[0]!}`,
        targetSupplied: true,
        reviewIds: [review.id],
        headReviewId: review.id,
        internal: 'INTERNALLY_CONSISTENT',
        issues: [],
        sourceTail: 'UNKNOWN',
      },
    ]);
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    // The reference statement asked for exactly the reviews read, under the loader bound.
    expect(referenceStatements(c.log).map((s) => s.values)).toEqual([
      [[review.id], MAX_GRAPH_ROWS + 1],
    ]);
    // A source-subject row read by id (P1d) has its own reviews unread.
    expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    expect(m.scope.categories.REVIEW_ATTESTATION_REFERENCES).toBe('REPRESENTED');
  });

  it('P1e-5: several reviews per claim and several claims: every one kept, superseded included', async () => {
    const { focal, claimIds, t } = world(3, 3);
    const a1 = reviewOf(claimTarget(claimIds[0]!));
    const a2 = reviewOf(claimTarget(claimIds[0]!), a1);
    const a3 = reviewOf(claimTarget(claimIds[0]!), a2, { review_outcome: 'WITHDRAWN' });
    const b1 = reviewOf(claimTarget(claimIds[1]!));
    t.reviews.push(a3, b1, a1, a2);
    t.attestations.push(attestationOf(a1), attestationOf(a3), attestationOf(b1));
    const result = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const m = result.manifest;
    expect(m.reviews.chains).toEqual([
      expect.objectContaining({
        targetKey: `relationship_claim:${claimIds[0]!}`,
        reviewIds: [a1.id, a2.id, a3.id],
        headReviewId: a3.id,
        internal: 'INTERNALLY_CONSISTENT',
        sourceTail: 'UNKNOWN',
      }),
      expect.objectContaining({
        targetKey: `relationship_claim:${claimIds[1]!}`,
        reviewIds: [b1.id],
        headReviewId: b1.id,
      }),
    ]);
    // a2 has no attestation: it is kept, and simply has no reference.
    expect(m.reviews.attestationReferences.map((r) => r.reviewId).sort()).toEqual(
      [a1.id, a3.id, b1.id].sort(),
    );
    // The superseded and withdrawing reviews are records, in deterministic id order.
    expect(result.input.records.reviews).toEqual([a1, a2, a3, b1].map(reviewRecordOf));
    expect(m.omissions.filter((o) => o.code === 'SUPERSEDED_REVIEW_NOT_SUPPLIED')).toEqual([]);
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
  });
});

describe('B2.5-P1e loader: only the included claims, never their sources or the sentinel', () => {
  it('P1e-6: reviews of the source subject, its other claims and unrelated records stay out', async () => {
    const { focal, sourceIds, claimIds, t } = world(1);
    const source = sourceIds[0]!;
    const elsewhere = ascendingId();
    const name = claimRow(source, { name_text: 'Synthetic P1e Source' });
    const onward = relation(source, 'OPERATES_AT', elsewhere);
    const unrelated = relation(elsewhere, 'AFFILIATED_WITH', source);
    t.subjects.push(subjectRow(elsewhere));
    t.identity.push(name);
    t.relationships.push(onward, unrelated);
    const ofSubject = reviewOf({ reviewed_subject_id: source });
    const ofName = reviewOf({ reviewed_identity_claim_id: name.id });
    const ofOnward = reviewOf(claimTarget(onward.id as string));
    const ofUnrelated = reviewOf(claimTarget(unrelated.id as string));
    const ofElsewhere = reviewOf({ reviewed_subject_id: elsewhere });
    const ofClaim = reviewOf(claimTarget(claimIds[0]!));
    t.reviews.push(ofSubject, ofName, ofOnward, ofUnrelated, ofElsewhere, ofClaim);
    t.attestations.push(...t.reviews.map(attestationOf));
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const ids = result.manifest.membership.entries.map((e) => e.recordId);
    expect(ids).toContain(ofClaim.id);
    for (const excluded of [ofSubject, ofName, ofOnward, ofUnrelated, ofElsewhere]) {
      expect(ids).not.toContain(excluded.id);
    }
    expect(claimReviewStatements(c.log).map((s) => s.values[0])).toEqual([
      [`relationship_claim:${claimIds[0]!}`],
    ]);
    expect(result.manifest.reviews.chains.map((ch) => ch.targetKey)).toEqual([
      `relationship_claim:${claimIds[0]!}`,
    ]);
    expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
  });

  it('P1e-7: the 21st (sentinel) claim’s reviews are never requested; caps are unchanged', async () => {
    const { focal, claimIds, t } = world(21, 3);
    const sentinel = claimIds[20]!;
    t.reviews.push(reviewOf(claimTarget(sentinel)), reviewOf(claimTarget(claimIds[0]!)));
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    const requested = claimReviewStatements(c.log)[0]!.values[0] as string[];
    expect(requested).toHaveLength(20);
    expect(requested).not.toContain(`relationship_claim:${sentinel}`);
    expect(result.incomingClaimReviews.requestedClaimIds).toEqual(claimIds.slice(0, 20));
    expect(JSON.stringify(result.manifest)).not.toContain(sentinel);
    expect(result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('INCOMPLETE');
    expect(result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    expect(result.manifest.reviews.chains).toHaveLength(1);
  });

  it('P1e-8: a claim the graph already reaches over PART_OF is not re-requested; its chain once', async () => {
    const focal = ascendingId();
    const parent = ascendingId();
    const up = relation(focal, 'PART_OF', parent, ascendingId());
    const back = relation(parent, 'PART_OF', focal, ascendingId());
    const r = reviewOf(claimTarget(back.id as string));
    const t: Tables = {
      subjects: [subjectRow(focal), subjectRow(parent)],
      identity: [claimRow(focal)],
      relationships: [up, back],
      reviews: [r],
      attestations: [attestationOf(r)],
    };
    const c = connectionSource(t);
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(claimReviewStatements(c.log)).toEqual([]);
    expect(result.incomingClaimReviews.outcome).toBe('NONE_REQUESTED');
    const m = result.manifest;
    expect(m.membership.entries.filter((e) => e.recordId === r.id)).toHaveLength(1);
    expect(m.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
  });

  it('P1e-9: a source subject held by the graph completes REVIEW_RECORDS; one read by id does not', async () => {
    const held = heldSourceWorld();
    const r = reviewOf(claimTarget(held.claimId));
    held.t.reviews.push(r);
    held.t.attestations.push(attestationOf(r));
    const mHeld = built(
      await assembleSubjectSnapshotScope(connectionSource(held.t).source, held.focal),
    ).manifest;
    expect(mHeld.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
    expect(mHeld.scope.categories.REVIEW_ATTESTATION_REFERENCES).toBe('REPRESENTED');
    expect(mHeld.reviews.chains.map((ch) => ch.reviewIds)).toEqual([[r.id]]);
    // Nothing broader: completeness, freshness, the latest review and trust stay unproven.
    expect(mHeld.states).toMatchObject({
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    expect(mHeld.reviews.latestReview).toBe('NOT_PROVEN');

    // The same claim whose source the graph does not hold: its row is read (P1d), its reviews are not.
    const { focal, claimIds, t } = world(1);
    t.reviews.push(reviewOf(claimTarget(claimIds[0]!)));
    const m = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal)).manifest;
    expect(m.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    expect(m.scope.categories.REFERENCED_RECORDS).toBe('REPRESENTED');
  });
});

describe('B2.5-P1e loader: an unexpected result reads nothing; chain shape is stated, not repaired', () => {
  /** Assembles over a held-source world whose claim has a two-review chain, rewriting one result. */
  async function rewritten(script: Script) {
    const w = heldSourceWorld();
    const r1 = reviewOf(claimTarget(w.claimId));
    const r2 = reviewOf(claimTarget(w.claimId), r1);
    w.t.reviews.push(r1, r2);
    w.t.attestations.push(attestationOf(r1), attestationOf(r2));
    const c = connectionSource(w.t, script);
    return { ...w, r1, r2, c, result: await assembleSubjectSnapshotScope(c.source, w.focal) };
  }

  it.each([
    ['a duplicated row', (rows: Row[]) => [rows[0]!, ...rows]],
    ['an unordered result', (rows: Row[]) => [...rows].reverse()],
    ['a predecessor missing from the result', (rows: Row[]) => rows.slice(1)],
    [
      'a review of another target',
      (rows: Row[]) => [...rows, reviewOf({ reviewed_subject_id: randomUUID() })],
    ],
    [
      'a review of an unrequested claim',
      (rows: Row[]) => [...rows, reviewOf(claimTarget(randomUUID()))],
    ],
    [
      'a mistyped field',
      (rows: Row[]) => rows.map((r, i) => (i === 0 ? { ...r, review_outcome: 7 } : r)),
    ],
    [
      'a predecessor of another target',
      (rows: Row[]) => {
        const other = reviewOf(claimTarget(randomUUID()));
        return rows.map((r, i) => (i === 1 ? { ...r, supersedes_review_id: other.id } : r));
      },
    ],
  ])('P1e-10: %s is UNKNOWN: no review used, REVIEW_RECORDS INCOMPLETE', async (_, reviews) => {
    const { r1, r2, result } = await rewritten({ reviews });
    const r = built(result);
    expect(r.incomingClaimReviews.outcome).toBe('UNKNOWN');
    const ids = r.manifest.membership.entries.map((e) => e.recordId);
    expect(ids).not.toContain(r1.id);
    expect(ids).not.toContain(r2.id);
    expect(r.manifest.reviews.attestationReferences).toEqual([]);
    expect(r.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    expect(r.manifest.scope.categories.REVIEW_ATTESTATION_REFERENCES).toBe('REPRESENTED');
  });

  it.each([
    [
      'two references to one review',
      (rows: Row[]) => [rows[0]!, { ...rows[1]!, review_id: rows[0]!.review_id }],
    ],
    ['an unordered reference result', (rows: Row[]) => [...rows].reverse()],
    [
      'a reference to an unread review',
      (rows: Row[]) => [...rows.slice(0, 1), { ...rows[1]!, review_id: randomUUID() }],
    ],
    [
      'a mistyped reference',
      (rows: Row[]) => rows.map((r, i) => (i === 0 ? { ...r, key_id: null } : r)),
    ],
  ])(
    'P1e-11: %s is UNKNOWN: neither the reviews nor any reference is used',
    async (_, references) => {
      const { r1, r2, result } = await rewritten({ references });
      const r = built(result);
      expect(r.incomingClaimReviews.outcome).toBe('UNKNOWN');
      const ids = r.manifest.membership.entries.map((e) => e.recordId);
      expect(ids).not.toContain(r1.id);
      expect(ids).not.toContain(r2.id);
      expect(r.manifest.reviews.attestationReferences).toEqual([]);
      expect(r.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
    },
  );

  it('P1e-12: a forked or several-rooted chain is kept as stored and stated INCONSISTENT', async () => {
    // The schema refuses both inside one snapshot (the integration test proves it);
    // a result carrying one is represented, never repaired or ranked.
    const forked = await rewritten({
      reviews: (rows) =>
        [
          ...rows,
          reviewOf(claimTarget(rows[0]!.reviewed_relationship_claim_id as string), rows[0]!),
        ].sort(byId),
    });
    const fm = built(forked.result).manifest;
    expect(fm.reviews.chains).toHaveLength(1);
    expect(fm.reviews.chains[0]).toMatchObject({
      internal: 'INTERNALLY_INCONSISTENT',
      headReviewId: null,
      sourceTail: 'UNKNOWN',
    });
    expect(fm.reviews.chains[0]!.issues).toContain('CHAIN_FORKED');
    expect(fm.reviews.chains[0]!.reviewIds).toHaveLength(3);
    // Every stored review was supplied, so the record category is unaffected by the shape.
    expect(fm.scope.categories.REVIEW_RECORDS).toBe('REPRESENTED');
    expect(fm.reviews.latestReview).toBe('NOT_PROVEN');

    const rooted = await rewritten({
      reviews: (rows) =>
        [...rows, reviewOf(claimTarget(rows[0]!.reviewed_relationship_claim_id as string))].sort(
          byId,
        ),
    });
    const rm = built(rooted.result).manifest;
    expect(rm.reviews.chains[0]!.issues).toEqual(expect.arrayContaining(['NO_SINGLE_ROOT']));
    expect(rm.reviews.chains[0]!.internal).toBe('INTERNALLY_INCONSISTENT');
  });

  it('P1e-13: a malformed included claim id is never sent and reads nothing', async () => {
    const { focal, t } = world(1);
    t.relationships[0]!.id = 'NOT-A-UUID';
    const { q, log } = queryable(t);
    const graph = (await loadSubjectGraph(q, focal, {
      asOf: NOW,
      incomingRelationships: 'REPORT',
      incomingClaimReviews: 'READ',
    }))!;
    expect(graph.incomingClaimReviewRead).toEqual({
      outcome: 'UNKNOWN',
      requestedClaimIds: [],
      reviews: [],
      attestationReferences: [],
    });
    expect(claimReviewStatements(log)).toEqual([]);
  });

  it('P1e-14: an UNKNOWN incoming report adds no review even if one was returned', async () => {
    const { focal, claimIds, t } = world(2);
    t.reviews.push(reviewOf(claimTarget(claimIds[0]!)));
    const c = connectionSource(t, { incoming: (rows) => [...rows].reverse() });
    const result = built(await assembleSubjectSnapshotScope(c.source, focal));
    expect(claimReviewStatements(c.log)).toEqual([]);
    expect(result.input.records.reviews).toEqual([]);
    expect(result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS).toBe('UNKNOWN');
  });
});

describe('B2.5-P1e loader: the bound refuses, a failure rolls back, other callers are unchanged', () => {
  it('P1e-15: a review result beyond the loader bound is refused: no manifest, rolled back', async () => {
    const { focal, claimIds, t } = world(1);
    const c = connectionSource(t, {
      reviews: () =>
        Array.from({ length: MAX_GRAPH_ROWS + 1 }, () => reviewOf(claimTarget(claimIds[0]!))),
    });
    await expect(assembleSubjectSnapshotScope(c.source, focal)).rejects.toBeInstanceOf(
      SubjectGraphBoundExceeded,
    );
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.releases).toEqual([undefined]);
    expect(c.connects()).toBe(1);
  });

  it('P1e-16: a reference result beyond the loader bound is refused the same way', async () => {
    const { focal, claimIds, t } = world(1);
    const r = reviewOf(claimTarget(claimIds[0]!));
    t.reviews.push(r);
    const c = connectionSource(t, {
      references: () =>
        Array.from({ length: MAX_GRAPH_ROWS + 1 }, () => ({
          id: ascendingId(),
          review_id: r.id,
          key_id: 'k',
          payload_sha256: 'c'.repeat(64),
        })),
    });
    await expect(assembleSubjectSnapshotScope(c.source, focal)).rejects.toThrow(
      /incoming claim review attestations/,
    );
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.releases).toEqual([undefined]);
  });

  it('P1e-17: a failing attestation-reference statement rolls back, returns nothing and releases once', async () => {
    const { focal, claimIds, t } = world(1);
    t.reviews.push(reviewOf(claimTarget(claimIds[0]!)));
    const c = connectionSource(t, { failOn: REFERENCE_SQL });
    await expect(assembleSubjectSnapshotScope(c.source, focal)).rejects.toThrow(
      'synthetic incoming-claim review query failure',
    );
    expect(c.log.sql.at(-1)).toBe('ROLLBACK');
    expect(c.releases).toEqual([undefined]);
  });

  it('P1e-18: without REPORT, READ and loaded attestations nothing new is sent and the graph is the same', async () => {
    const { focal, claimIds, t } = world(4, 2);
    t.relationships.push(relation(focal, 'PART_OF', t.subjects[1]!.id as string, ascendingId()));
    t.reviews.push(reviewOf(claimTarget(claimIds[0]!)));
    const plain = queryable(t);
    const base = (await loadSubjectGraph(plain.q, focal, { asOf: NOW }))!;
    for (const options of [
      { incomingClaimReviews: 'READ' as const },
      { incomingRelationships: 'REPORT' as const, incomingClaimReviews: 'OMIT' as const },
      {
        incomingRelationships: 'REPORT' as const,
        incomingClaimReviews: 'READ' as const,
        attestations: 'SKIP' as const,
      },
    ]) {
      const other = queryable(t);
      const graph = (await loadSubjectGraph(other.q, focal, { asOf: NOW, ...options }))!;
      expect(graph).not.toHaveProperty('incomingClaimReviewRead');
      expect(claimReviewStatements(other.log)).toEqual([]);
      expect(referenceStatements(other.log)).toEqual([]);
      const { incomingRelationshipClaimEnumeration, ...rest } = graph;
      void incomingRelationshipClaimEnumeration;
      if (options.attestations === 'SKIP') {
        const { attestations, ...b } = base;
        void attestations;
        expect(rest).toEqual(b);
      } else {
        expect(rest).toEqual(base);
      }
    }
    // With everything asked for, the graph itself is still the base graph.
    const full = queryable(t);
    const graph = (await loadSubjectGraph(full.q, focal, {
      asOf: NOW,
      incomingRelationships: 'REPORT',
      incomingClaimSourceSubjects: 'READ',
      incomingClaimReviews: 'READ',
    }))!;
    const {
      incomingRelationshipClaimEnumeration,
      incomingClaimSourceSubjectRead,
      incomingClaimReviewRead,
      ...rest
    } = graph;
    void incomingRelationshipClaimEnumeration;
    void incomingClaimSourceSubjectRead;
    expect(rest).toEqual(base);
    expect(incomingClaimReviewRead!.reviews.map((r) => r.id)).toEqual([t.reviews[0]!.id]);
    expect(full.log.sql.slice(0, plain.log.sql.length)).toEqual(plain.log.sql);
  });
});

describe('B2.5-P1e assembler: determinism and unchanged trust, protection and permission', () => {
  it('P1e-19: the same stored reviews give the same canonical manifest in any table order', async () => {
    const { focal, claimIds, t } = world(3, 2);
    const a1 = reviewOf(claimTarget(claimIds[0]!));
    const a2 = reviewOf(claimTarget(claimIds[0]!), a1);
    const b1 = reviewOf(claimTarget(claimIds[2]!));
    t.reviews.push(a1, a2, b1);
    t.attestations.push(attestationOf(a2), attestationOf(b1));
    const first = built(await assembleSubjectSnapshotScope(connectionSource(t).source, focal));
    const shuffled: Tables = {
      ...t,
      reviews: [...t.reviews].reverse(),
      attestations: [...t.attestations].reverse(),
      relationships: [...t.relationships].reverse(),
    };
    const second = built(
      await assembleSubjectSnapshotScope(connectionSource(shuffled).source, focal),
    );
    expect(second.canonical).toBe(first.canonical);
    expect(second.manifest.manifestDigest).toBe(first.manifest.manifestDigest);
    // Changing one stored review changes its digest and the manifest's.
    const edited: Tables = {
      ...t,
      reviews: t.reviews.map((r) => (r.id === b1.id ? { ...r, reason: 'edited' } : r)),
    };
    const third = built(await assembleSubjectSnapshotScope(connectionSource(edited).source, focal));
    expect(third.manifest.manifestDigest).not.toBe(first.manifest.manifestDigest);
  });

  it('P1e-20: a CONFIRMED, attested review grants nothing and proves nothing beyond itself', async () => {
    const held = heldSourceWorld();
    const r = reviewOf(claimTarget(held.claimId), null, { review_outcome: 'CONFIRMED' });
    held.t.reviews.push(r);
    held.t.attestations.push(attestationOf(r));
    const result = built(
      await assembleSubjectSnapshotScope(connectionSource(held.t).source, held.focal),
    );
    const m = result.manifest;
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(m.scope.categories.PROTECTION_STATUS).toBe('UNKNOWN');
    expect(m.states).toMatchObject({
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    expect(m.reviews.chains.every((ch) => ch.sourceTail === 'UNKNOWN')).toBe(true);
    expect(
      m.reviews.attestationReferences.every(
        (a) =>
          a.signatureVerification === 'NOT_PERFORMED' && a.reviewerTrust === 'NONE_ESTABLISHED',
      ),
    ).toBe(true);
    expect(Object.values(m.permissions).every((p) => p === 'NONE')).toBe(true);
    expect(m.canonicalIssuer).toEqual({ producerMayIssue: 'NONE', identifiersIssuedHere: 'NONE' });
    expect(m.scope.parentage).toEqual({
      transitive: 'UNKNOWN',
      direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
      independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
      legalIndependence: 'UNKNOWN',
    });
    expect(m.validation.unavailableInputs).toContain('REVIEW_ATTESTATION_SIGNATURES');
    expect(m.scope.categories.SOURCE_GLOBALS).toBe('INCOMPLETE');
    expect(JSON.stringify(m)).not.toMatch(/"(cand|chn|opp):|SAME_ACTOR|INDEPENDENT_OF/);
    expect(result.read).toBe(SNAPSHOT_READ_FACTS);
    expect(SNAPSHOT_READ_FACTS.loaderLimitations).toEqual(
      expect.arrayContaining([
        'ATTESTATION_PAYLOADS_SIGNATURES_ENVIRONMENT_AND_NONCE_COUNTS_NOT_REPRESENTED',
        'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_STORED_RECORDS_ONLY_NOT_VERIFIED_NOT_TRUSTED_NOT_PROVEN_LATEST',
        'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
      ]),
    );
    expect(SNAPSHOT_READ_FACTS.loaderLimitations).not.toContain(
      'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',
    );
    expect([...SNAPSHOT_READ_FACTS.loaderLimitations]).toEqual(
      [...SNAPSHOT_READ_FACTS.loaderLimitations].sort(),
    );
    expect(SCOPE_DECLARATION_BASIS.REVIEW_RECORDS).toContain('SOURCE_SUBJECT_REVIEWS_UNREAD');
  });
});
