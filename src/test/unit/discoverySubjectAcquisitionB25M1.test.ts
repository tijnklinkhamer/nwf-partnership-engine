/**
 * Track B, B2.5-M1 - the stable record-set digest and the acquisition
 * companion, WITHOUT a database. One in-memory Queryable answers the B2.2
 * loader's SELECTs over synthetic rows the way their SQL reads, plus the
 * assembler's own transaction-control statements and the one clock reading.
 * A scripted override can return a holder, incoming, source-subject or
 * claim-review result no real query would, to reach every loader outcome.
 *
 * Every record here is a real B2.1 record shape over SYNTHETIC subjects
 * (`.example` sources). Ids are minted in ascending order wherever a test
 * depends on which rows a capped query includes.
 *
 * That PostgreSQL produces these loader outcomes in one snapshot, and that two
 * real reads of unchanged rows share a record-set digest while their as-of
 * differs, is proven by
 * src/test/integration/discoverySubjectAcquisitionB25M1.test.ts.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  MAX_GRAPH_ROWS,
  MAX_SHARED_IDENTIFIER_HOLDERS,
  type Queryable,
} from '../../orgunits/subjectRegistry/store.js';
import {
  SNAPSHOT_READ_FACTS,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';
import {
  buildSnapshotScopeManifest,
  manifestDigestOfBody,
  membershipDigestOf,
  type SnapshotScopeInput,
  type SnapshotScopeManifest,
} from '../../orgunits/subjectSnapshot/manifest.js';
import { RECORD_TYPES, SOURCE_GLOBAL_KEYS } from '../../orgunits/subjectSnapshot/contract.js';
import {
  ACQUISITION_COMPANION_CONTRACT,
  AUTHENTICITY,
  HOLDER_INCLUDED_CAP,
  HOLDER_QUERY_LIMIT,
  INCOMING_INCLUDED_CAP,
  INCOMING_QUERY_LIMIT,
  MEMBERSHIP_RECORD_TYPES,
  PERMISSIONS,
  READ_PROTOCOL,
  RECORD_SET_RULE,
  REVIEW_STATEMENT_ROW_BOUND,
  SOURCE_GLOBAL_RECORD_IDS,
} from '../../orgunits/subjectReadProvenance/contract.js';
import {
  acquisitionDigestOfBody,
  buildAcquisitionCompanion,
  companionCanonicalJson,
  recordSetDigestOf,
  reproduceAcquisitionCompanion,
  verifyAcquisitionCompanion,
  type AcquisitionCompanion,
  type AcquisitionObservations,
} from '../../orgunits/subjectReadProvenance/companion.js';

const CLOCK = '2026-10-18T12:00:00.005000Z';
const LATER_CLOCK = '2026-10-18T13:30:00.250000Z';
const OBSERVED = '2026-10-01T09:00:00.000000Z';
const STATE = {
  isolation: 'repeatable read',
  read_only: 'on',
  snapshot: '940:940:',
  started: '2026-10-18 12:00:00+00',
};
const PIC = '999400071';
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
  attestations: Row[];
  organisations: string[];
}

let counter = 0;
/** A fresh lower-case UUID that sorts after every earlier one from this helper. */
const ascendingId = (): string => {
  counter += 1;
  return `44444444-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const provenance = (): Row => ({
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-m1.example/unit',
  source_version_ref: null,
  observed_at: OBSERVED,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'm1-synthetic',
  created_at: OBSERVED,
});
const subjectRow = (id: string, kind = 'UNCERTAIN'): Row => ({
  id,
  registered_kind: kind,
  registered_by_actor_key: 'm1-synthetic',
  registration_note: null,
  created_at: OBSERVED,
});
const claimRow = (subjectId: string, extra: Row = {}): Row => ({
  id: ascendingId(),
  subject_id: subjectId,
  claim_kind: 'NAME',
  name_text: 'Synthetic M1',
  name_language: null,
  claimed_kind: null,
  website_url: null,
  identifier_scheme: null,
  identifier_value: null,
  ...provenance(),
  ...extra,
});
const picRow = (subjectId: string): Row =>
  claimRow(subjectId, {
    claim_kind: 'EXTERNAL_IDENTIFIER',
    name_text: null,
    identifier_scheme: 'EU_PIC',
    identifier_value: PIC,
  });
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
const reviewOfClaim = (claimId: string, supersedes: string | null = null): Row => ({
  id: ascendingId(),
  reviewed_subject_id: null,
  reviewed_identity_claim_id: null,
  reviewed_relationship_claim_id: claimId,
  review_outcome: supersedes === null ? 'CONFIRMED' : 'DISPUTED',
  supersedes_review_id: supersedes,
  actor_key: 'm1-synthetic',
  reviewed_at: OBSERVED,
  reason: null,
  created_at: OBSERVED,
});
const attestationOf = (reviewId: string): Row => ({
  id: ascendingId(),
  review_id: reviewId,
  key_id: 'm1-test-key',
  payload_sha256: 'ab'.repeat(32),
});
const reviewTarget = (r: Row): string =>
  r.reviewed_subject_id !== null
    ? `subject:${r.reviewed_subject_id as string}`
    : r.reviewed_identity_claim_id !== null
      ? `identity_claim:${r.reviewed_identity_claim_id as string}`
      : `relationship_claim:${r.reviewed_relationship_claim_id as string}`;
const byId = (a: Row, b: Row) => ((a.id as string) < (b.id as string) ? -1 : 1);

interface Script {
  readonly clock?: string;
  readonly holders?: (computed: string[]) => unknown[];
  readonly incoming?: (computed: Row[]) => Row[];
  readonly sources?: (computed: Row[]) => Row[];
  readonly claimReviews?: (computed: Row[]) => Row[];
  /** Replaces the loader's own subject-row statement's answer. */
  readonly graphSubjects?: (computed: Row[]) => Row[];
}

function connectionSource(t: Tables, script: Script = {}) {
  const sql: string[] = [];
  const values: unknown[][] = [];
  let incomingSent = false;
  const answer = (text: string, v: unknown[]): unknown[] => {
    if (text.includes('no_open_block')) return [{ no_open_block: true }];
    if (text.startsWith('BEGIN') || text === 'ROLLBACK') return [];
    if (text.includes(STATE_SQL)) return [STATE];
    if (text.includes(CLOCK_SQL)) return [{ now: script.clock ?? CLOCK }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(text)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (text.includes(INCOMING_SQL)) {
      incomingSent = true;
      const rows = t.relationships
        .filter((r) => r.target_subject_id === v[0] && r.subject_id !== v[0])
        .sort(byId)
        .slice(0, v[1] as number);
      return script.incoming ? script.incoming(rows) : rows;
    }
    if (text.includes('FROM discovery_subject_relationship_claims')) {
      const frontier = v[0] as string[];
      return t.relationships.filter(
        (r) =>
          frontier.includes(r.subject_id as string) &&
          (r.subject_id === v[1] || r.predicate === 'PART_OF'),
      );
    }
    if (text.includes('SELECT DISTINCT identifier_scheme AS scheme')) {
      const pairs = t.identity
        .filter((c) => c.subject_id === v[0] && c.claim_kind === 'EXTERNAL_IDENTIFIER')
        .map((c) => `${c.identifier_scheme as string}|${c.identifier_value as string}`);
      return [...new Set(pairs)].sort().map((p) => {
        const [scheme, value] = p.split('|');
        return { scheme, value };
      });
    }
    if (text.includes(HOLDER_SQL)) {
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
    if (text.includes(SOURCE_SQL)) {
      const rows = t.subjects
        .filter((s) => (v[0] as string[]).includes(s.id as string))
        .sort(byId)
        .slice(0, v[1] as number);
      return script.sources ? script.sources(rows) : rows;
    }
    if (text.includes('FROM discovery_subjects WHERE id = ANY')) {
      const rows = t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
      return script.graphSubjects ? script.graphSubjects(rows) : rows;
    }
    if (text.includes('FROM discovery_subject_identity_claims')) {
      return t.identity.filter((c) => (v[0] as string[]).includes(c.subject_id as string));
    }
    if (text.includes(REVIEW_SQL)) {
      const rows = t.reviews
        .filter((r) => (v[0] as string[]).includes(reviewTarget(r)))
        .sort(byId)
        .slice(0, v[1] as number);
      return incomingSent && script.claimReviews ? script.claimReviews(rows) : rows;
    }
    if (text.includes('FROM organisations')) {
      return t.organisations
        .filter((k) => (v[0] as string[]).includes(k))
        .sort()
        .map((eche_row_key) => ({ eche_row_key }));
    }
    if (text.includes('FROM subject_review_environment')) {
      return [{ environment_id: '00000000-0000-4000-8000-0000000000e4' }];
    }
    if (text.includes(REFERENCE_SQL)) {
      return t.attestations
        .filter((a) => (v[0] as string[]).includes(a.review_id as string))
        .sort(byId);
    }
    if (text.includes('FROM subject_review_attestations')) return [];
    throw new Error(`unscripted statement: ${text}`);
  };
  const query = (async (text: string, v: unknown[] = []) => {
    sql.push(text);
    values.push(v);
    return { rows: answer(text, v) };
  }) as unknown as Queryable['query'];
  const source: SnapshotReadConnectionSource = {
    connect: async () => ({
      query: query as unknown as SnapshotReadConnection['query'],
      release: () => undefined,
    }),
  };
  return { source, sql, values };
}

const empty = (): Tables => ({
  subjects: [],
  identity: [],
  relationships: [],
  reviews: [],
  attestations: [],
  organisations: [],
});

/** A focal subject - named unless told otherwise - and nothing else. */
function world(named = true) {
  const t = empty();
  const focal = ascendingId();
  t.subjects.push(subjectRow(focal));
  if (named) t.identity.push(claimRow(focal));
  return { focal, t };
}

/** A fresh source subject with one incoming claim to `focal`; returns both ids. */
function incomingFrom(t: Tables, focal: string, named = true) {
  const source = ascendingId();
  t.subjects.push(subjectRow(source, 'NETWORK_LOCAL_CHAPTER'));
  if (named) t.identity.push(claimRow(source));
  const claim = relation(source, 'AFFILIATED_WITH', focal);
  t.relationships.push(claim);
  return { source, claim: claim.id as string };
}

type Built = Extract<SubjectSnapshotReadResult, { outcome: 'BUILT' }>;

function built(result: SubjectSnapshotReadResult): Built {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

async function acquired(
  t: Tables,
  focal: string,
  script: Script = {},
  validation: 'RUN' | 'NOT_RUN' = 'NOT_RUN',
) {
  const c = connectionSource(t, script);
  const result = built(
    await assembleSubjectSnapshotScope(c.source, focal, {
      validation,
      acquisitionCompanion: 'BUILD',
    }),
  );
  expect(result.acquisition).toBeDefined();
  return { result, a: result.acquisition!, c };
}

const clone = <T>(v: T): T => structuredClone(v);

/** Rebuilds a companion from (possibly mutated) observations of `result`. */
function rebuild(
  result: Built,
  mutate: (o: AcquisitionObservations & Record<string, unknown>) => void,
) {
  const observations = clone(result.acquisition!.observations) as AcquisitionObservations &
    Record<string, unknown>;
  mutate(observations);
  return buildAcquisitionCompanion({
    manifest: result.manifest,
    input: result.input,
    observations,
  });
}

/** Every string value anywhere in `value`. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

/** A manifest with one membership entry changed, and every S0 digest recomputed to match. */
function forgedManifest(
  manifest: SnapshotScopeManifest,
  edit: (entries: SnapshotScopeManifest['membership']['entries'][number][]) => void,
): SnapshotScopeManifest {
  const m = clone(manifest) as unknown as {
    membership: {
      entries: SnapshotScopeManifest['membership']['entries'][number][];
      membershipDigest: string;
    };
    manifestDigest: string;
  };
  edit(m.membership.entries);
  m.membership.membershipDigest = membershipDigestOf(m.membership.entries);
  const { manifestDigest: _ignored, ...body } = m as unknown as SnapshotScopeManifest;
  m.manifestDigest = manifestDigestOfBody(body);
  return m as unknown as SnapshotScopeManifest;
}

describe('B2.5-M1: the default and validated reads are unchanged (16)', () => {
  it('M1-U1: without the opt-in nothing is attached; with it the statements and the manifest are identical', async () => {
    const { focal, t } = world();
    t.identity.push(picRow(focal));
    incomingFrom(t, focal);
    for (const validation of ['NOT_RUN', 'RUN'] as const) {
      const plain = connectionSource(t);
      const before = built(await assembleSubjectSnapshotScope(plain.source, focal, { validation }));
      for (const opt of [undefined, 'OMIT', 'build', 'yes']) {
        const c = connectionSource(t);
        const result = built(
          await assembleSubjectSnapshotScope(c.source, focal, {
            validation,
            acquisitionCompanion: opt,
          } as Parameters<typeof assembleSubjectSnapshotScope>[2]),
        );
        expect('acquisition' in result).toBe(false);
        expect(result.canonical).toBe(before.canonical);
      }
      const { result, c } = await acquired(t, focal, {}, validation);
      expect(c.sql).toEqual(plain.sql);
      expect(c.values).toEqual(plain.values);
      expect(result.canonical).toBe(before.canonical);
      expect(result.input).toEqual(before.input);
      expect(result.read).toBe(before.read);
      expect(result.validation).toEqual(before.validation);
      expect(result.incomingClaimSourceSubjects).toEqual(before.incomingClaimSourceSubjects);
      expect(result.incomingClaimReviews).toEqual(before.incomingClaimReviews);
      const { acquisition: _a, ...rest } = result;
      expect(Object.keys(rest).sort()).toEqual(Object.keys(before).sort());
    }
  });

  it('M1-U2: the default read facts and the S0 manifest are the accepted ones', async () => {
    const { focal, t } = world();
    const { result } = await acquired(t, focal);
    expect(result.read).toBe(SNAPSHOT_READ_FACTS);
    expect(buildSnapshotScopeManifest(result.input)).toEqual({
      outcome: 'BUILT',
      manifest: result.manifest,
      canonical: result.canonical,
    });
  });
});

describe('B2.5-M1: the record-set digest (1-5)', () => {
  it('M1-U3 (1): equal records with a different as-of share the record-set digest, not the manifest digest', async () => {
    const { focal, t } = world();
    t.identity.push(picRow(focal));
    t.organisations.push('F  M1SYN01|999400072');
    t.relationships.push(echeRelation(focal, 'F  M1SYN01|999400072'));
    const early = await acquired(t, focal, { clock: CLOCK });
    const late = await acquired(t, focal, { clock: LATER_CLOCK });
    expect(early.result.input.validation.asOf).toBe(CLOCK);
    expect(late.result.input.validation.asOf).toBe(LATER_CLOCK);
    expect(late.result.manifest.manifestDigest).not.toBe(early.result.manifest.manifestDigest);
    expect(late.a.acquisitionDigest).not.toBe(early.a.acquisitionDigest);
    expect(late.a.binding.recordSetDigest).toBe(early.a.binding.recordSetDigest);
    // Independently recomputed from each manifest alone, and from manifest + input.
    for (const r of [early.result, late.result]) {
      const alone = recordSetDigestOf(r.manifest);
      const reproduced = recordSetDigestOf(r.manifest, r.input);
      expect(alone).toEqual(reproduced);
      expect(alone.outcome === 'COMPUTED' && alone.recordSetDigest).toBe(
        early.a.binding.recordSetDigest,
      );
    }
    // Both source globals are in the manifest, and neither is in the record set.
    const computed = recordSetDigestOf(early.result.manifest);
    if (computed.outcome !== 'COMPUTED') throw new Error('refused');
    const globals = early.result.manifest.membership.entries
      .filter((e) => e.recordType === 'SOURCE_GLOBAL')
      .map((e) => e.recordId);
    expect(globals.sort()).toEqual(['ECHE_ROW_KEY_EXISTENCE', 'VALIDATION_AS_OF']);
    expect(computed.entries.filter((e) => (e.recordType as string) === 'SOURCE_GLOBAL')).toEqual(
      [],
    );
    expect(computed.recordCount).toBe(early.result.manifest.membership.entries.length - 2);
    expect(early.a.binding.recordCount).toBe(computed.recordCount);
  });

  it('M1-U3a: the record set is exactly the stored evidence records; every source global is excluded', () => {
    // The two rule lists partition S0's own record types, and nothing else.
    expect(RECORD_SET_RULE.includedRecordTypes).toEqual([
      'SUBJECT',
      'IDENTITY_CLAIM',
      'RELATIONSHIP_CLAIM',
      'REVIEW',
      'REVIEW_ATTESTATION_REFERENCE',
    ]);
    expect(RECORD_SET_RULE.excludedRecordTypes).toEqual(['SOURCE_GLOBAL']);
    expect(
      [...RECORD_SET_RULE.includedRecordTypes, ...RECORD_SET_RULE.excludedRecordTypes].sort(),
    ).toEqual([...RECORD_TYPES].sort());
    expect([...MEMBERSHIP_RECORD_TYPES]).toEqual([...RECORD_TYPES]);
    // Every S0 source-global key is excluded by name: VALIDATION_AS_OF AND ECHE_ROW_KEY_EXISTENCE.
    expect([...SOURCE_GLOBAL_RECORD_IDS]).toEqual([...SOURCE_GLOBAL_KEYS]);
    expect(RECORD_SET_RULE.excludedMembership).toEqual(
      SOURCE_GLOBAL_KEYS.map((k) => `SOURCE_GLOBAL:${k}`),
    );
    expect(RECORD_SET_RULE.sourceGlobalBinding).toBe(
      'BOUND_BY_THE_S0_MANIFEST_DIGEST_AND_THROUGH_IT_BY_THE_ACQUISITION_DIGEST',
    );
  });

  it('M1-U3b: the digest is reproduced from stored records only; reintroducing a source global is detected', async () => {
    const { focal, t } = world();
    t.identity.push(picRow(focal));
    t.organisations.push('F  M1SYN05|999400076');
    t.relationships.push(echeRelation(focal, 'F  M1SYN05|999400076'));
    const { claim } = incomingFrom(t, focal);
    const review = reviewOfClaim(claim);
    t.reviews.push(review);
    t.attestations.push(attestationOf(review.id as string));
    const { result, a } = await acquired(t, focal);
    const recordSetDigestOver = (entries: readonly { recordType: string }[]) => {
      const rank = (x: string) => (RECORD_TYPES as readonly string[]).indexOf(x);
      const sorted = entries
        .map((e) => {
          const { recordType, recordId, contentDigest } = e as unknown as Record<string, string>;
          return { recordType: recordType!, recordId: recordId!, contentDigest: contentDigest! };
        })
        .sort((x, y) =>
          x.recordType === y.recordType
            ? x.recordId < y.recordId
              ? -1
              : 1
            : rank(x.recordType) - rank(y.recordType),
        );
      return createHash('sha256')
        .update(
          `${ACQUISITION_COMPANION_CONTRACT}/record-set\n${companionCanonicalJson(sorted)}`,
          'utf8',
        )
        .digest('hex');
    };
    const membership = result.manifest.membership.entries;
    const stored = membership.filter((e) => e.recordType !== 'SOURCE_GLOBAL');
    expect(new Set(stored.map((e) => e.recordType))).toEqual(
      new Set([
        'SUBJECT',
        'IDENTITY_CLAIM',
        'RELATIONSHIP_CLAIM',
        'REVIEW',
        'REVIEW_ATTESTATION_REFERENCE',
      ]),
    );
    // Independently recomputed from the stored records alone: exactly the bound digest.
    expect(a.binding.recordSetDigest).toBe(recordSetDigestOver(stored));
    expect(a.binding.recordCount).toBe(stored.length);
    // Any source global put back - the ECHE state, the as-of, or both - is a different digest.
    const eche = membership.filter((e) => e.recordId === 'ECHE_ROW_KEY_EXISTENCE');
    const asOf = membership.filter((e) => e.recordId === 'VALIDATION_AS_OF');
    expect(eche).toHaveLength(1);
    expect(asOf).toHaveLength(1);
    for (const rival of [
      [...stored, ...eche],
      [...stored, ...asOf],
      [...stored, ...eche, ...asOf],
    ]) {
      expect(recordSetDigestOver(rival)).not.toBe(a.binding.recordSetDigest);
    }
    // A companion re-bound to a record set that includes the ECHE state is caught.
    const rebound = clone(a) as unknown as AcquisitionCompanion & {
      binding: { recordSetDigest: string; recordCount: number };
      acquisitionDigest: string;
    };
    rebound.binding.recordSetDigest = recordSetDigestOver([...stored, ...eche]);
    rebound.binding.recordCount = stored.length + 1;
    const { acquisitionDigest: _r, ...reboundBody } = rebound;
    rebound.acquisitionDigest = acquisitionDigestOfBody(reboundBody);
    expect(verifyAcquisitionCompanion(rebound, result.manifest).inconsistencies).toEqual([
      'recordSetDigest',
    ]);
  });

  it('M1-U4 (2): a changed, added or removed record changes the record-set digest', async () => {
    const { focal, t } = world();
    const { claim } = incomingFrom(t, focal);
    t.reviews.push(reviewOfClaim(claim));
    t.attestations.push(attestationOf(t.reviews[0]!.id as string));
    const base = (await acquired(t, focal)).a.binding.recordSetDigest;
    const variants: [string, (x: Tables) => void][] = [
      ['changed claim text', (x) => (x.identity[0]!.name_text = 'Synthetic M1 Renamed')],
      ['added identity claim', (x) => x.identity.push(claimRow(focal, { name_text: 'Alias' }))],
      ['removed incoming claim', (x) => (x.relationships = [])],
      ['changed review outcome', (x) => (x.reviews[0]!.review_outcome = 'DISPUTED')],
      [
        'added superseding review',
        (x) => x.reviews.push(reviewOfClaim(claim, x.reviews[0]!.id as string)),
      ],
      [
        'added attestation reference',
        (x) => x.attestations.push(attestationOf(x.reviews[0]!.id as string)),
      ],
      [
        'changed attestation reference',
        (x) => (x.attestations[0]!.payload_sha256 = 'cd'.repeat(32)),
      ],
      ['removed attestation reference', (x) => (x.attestations = [])],
      [
        'ECHE row now present',
        (x) => {
          x.relationships.push(echeRelation(focal, 'F  M1SYN02|999400073'));
        },
      ],
    ];
    const seen = new Set([base]);
    for (const [name, change] of variants) {
      const x = clone(t);
      change(x);
      const digest = (await acquired(x, focal)).a.binding.recordSetDigest;
      expect(seen.has(digest), name).toBe(false);
      seen.add(digest);
    }
  });

  it('M1-U4a: the ECHE key state alone keeps the record-set digest and moves the manifest and acquisition digests', async () => {
    const { focal, t } = world();
    const key = 'F  M1SYN03|999400074';
    t.relationships.push(echeRelation(focal, key));
    const absentWorld = clone(t);
    const presentWorld = clone(t);
    presentWorld.organisations.push(key);
    const absent = await acquired(absentWorld, focal);
    const present = await acquired(presentWorld, focal);
    // The same stored records, so the same record set...
    expect(present.a.binding.recordSetDigest).toBe(absent.a.binding.recordSetDigest);
    expect(present.a.binding.recordCount).toBe(absent.a.binding.recordCount);
    // ...while S0 still binds the two different ECHE states, and through it the companion.
    expect(absent.result.input.validation.echeRowKeyState).toMatchObject({ presentKeys: [] });
    expect(present.result.input.validation.echeRowKeyState).toMatchObject({ presentKeys: [key] });
    const echeOf = (m: SnapshotScopeManifest) =>
      m.membership.entries.find((e) => e.recordId === 'ECHE_ROW_KEY_EXISTENCE')!.contentDigest;
    expect(echeOf(present.result.manifest)).not.toBe(echeOf(absent.result.manifest));
    expect(present.result.manifest.membership.membershipDigest).not.toBe(
      absent.result.manifest.membership.membershipDigest,
    );
    expect(present.result.manifest.manifestDigest).not.toBe(absent.result.manifest.manifestDigest);
    expect(present.a.binding.snapshotManifestDigest).toBe(present.result.manifest.manifestDigest);
    expect(present.a.acquisitionDigest).not.toBe(absent.a.acquisitionDigest);
    // Each companion verifies only against its own manifest.
    expect(verifyAcquisitionCompanion(present.a, present.result.manifest).inconsistencies).toEqual(
      [],
    );
    expect(verifyAcquisitionCompanion(present.a, absent.result.manifest).inconsistencies).toEqual([
      'snapshotManifestDigest',
    ]);
    // Supplied versus not supplied at all: the same record set, a different manifest.
    const supplied = absent.result.input;
    const unsupplied = {
      ...supplied,
      validation: { ...supplied.validation, echeRowKeyState: null },
    } as SnapshotScopeInput;
    const notSupplied = buildSnapshotScopeManifest(unsupplied);
    if (notSupplied.outcome !== 'BUILT') throw new Error(`refused ${JSON.stringify(notSupplied)}`);
    expect(
      notSupplied.manifest.membership.entries.some((e) => e.recordId === 'ECHE_ROW_KEY_EXISTENCE'),
    ).toBe(false);
    expect(notSupplied.manifest.manifestDigest).not.toBe(absent.result.manifest.manifestDigest);
    const digest = recordSetDigestOf(notSupplied.manifest, unsupplied);
    expect(digest.outcome === 'COMPUTED' && digest.recordSetDigest).toBe(
      absent.a.binding.recordSetDigest,
    );
  });

  it('M1-U5 (3): any row order gives byte-identical manifests and companions', async () => {
    const { focal, t } = world();
    t.identity.push(picRow(focal));
    for (let i = 0; i < 3; i += 1) {
      const holder = ascendingId();
      t.subjects.push(subjectRow(holder));
      t.identity.push(picRow(holder), claimRow(holder));
    }
    for (let i = 0; i < 3; i += 1) {
      const { claim } = incomingFrom(t, focal, i !== 1);
      const first = reviewOfClaim(claim);
      t.reviews.push(first, reviewOfClaim(claim, first.id as string));
      t.attestations.push(attestationOf(first.id as string));
    }
    const forward = await acquired(t, focal, {}, 'RUN');
    const reversed = clone(t);
    for (const k of ['subjects', 'identity', 'relationships', 'reviews', 'attestations'] as const) {
      reversed[k].reverse();
    }
    const backward = await acquired(reversed, focal, {}, 'RUN');
    expect(backward.result.canonical).toBe(forward.result.canonical);
    expect(JSON.stringify(backward.a)).toBe(JSON.stringify(forward.a));
    // S0 directly, with every supplied collection reversed.
    const input = clone(forward.result.input) as unknown as {
      records: Record<string, unknown[]>;
    };
    for (const k of Object.keys(input.records)) input.records[k]!.reverse();
    const again = buildSnapshotScopeManifest(input);
    if (again.outcome !== 'BUILT') throw new Error('refused');
    expect(again.canonical).toBe(forward.result.canonical);
    expect(recordSetDigestOf(again.manifest)).toEqual(recordSetDigestOf(forward.result.manifest));
  });

  it('M1-U6 (4): changed findings without changed records keep the record-set digest and move every other binding', async () => {
    const { focal, t } = world(false); // an unnamed focal subject: one FOCAL_RECORD finding
    incomingFrom(t, focal, false); // an unnamed row-only source: one withheld diagnostic
    const plain = await acquired(t, focal);
    const run = await acquired(t, focal, {}, 'RUN');
    expect(run.result.manifest.validation.findings.length).toBeGreaterThan(0);
    expect(run.a.binding.recordSetDigest).toBe(plain.a.binding.recordSetDigest);
    expect(run.result.manifest.manifestDigest).not.toBe(plain.result.manifest.manifestDigest);
    expect(run.a.acquisitionDigest).not.toBe(plain.a.acquisitionDigest);
    // Directly through S0: the same records with one more finding.
    const extra = {
      ...run.result.input,
      findings: [
        ...run.result.input.findings,
        {
          severity: 'REVIEW_SIGNAL',
          code: 'SYNTHETIC_EXTRA',
          recordId: focal,
          subjectId: focal,
          field: null,
        },
      ],
    } as SnapshotScopeInput;
    const m = buildSnapshotScopeManifest(extra);
    if (m.outcome !== 'BUILT') throw new Error(`refused ${JSON.stringify(m)}`);
    expect(m.manifest.manifestDigest).not.toBe(run.result.manifest.manifestDigest);
    const digest = recordSetDigestOf(m.manifest, extra);
    expect(digest.outcome === 'COMPUTED' && digest.recordSetDigest).toBe(
      run.a.binding.recordSetDigest,
    );
  });

  it('M1-U7 (5): a tampered, forged, duplicated or malformed S0 manifest is refused', async () => {
    const { focal, t } = world();
    const { claim } = incomingFrom(t, focal);
    t.reviews.push(reviewOfClaim(claim));
    const { result } = await acquired(t, focal);
    const m = result.manifest;
    const entries = m.membership.entries;

    // An edited content digest without recomputed S0 digests: inconsistent.
    const edited = clone(m) as unknown as { membership: { entries: { contentDigest: string }[] } };
    edited.membership.entries[0]!.contentDigest = 'f'.repeat(64);
    expect(recordSetDigestOf(edited)).toMatchObject({
      outcome: 'REFUSED',
      code: 'MANIFEST_DIGEST_INCONSISTENT',
    });
    // The same edit with every S0 digest recomputed passes S0's own check, so
    // only reproduction from the input can see it.
    const forged = forgedManifest(m, (e) => {
      e[0] = { ...e[0]!, contentDigest: 'f'.repeat(64) };
    });
    expect(recordSetDigestOf(forged).outcome).toBe('COMPUTED');
    expect(recordSetDigestOf(forged, result.input)).toMatchObject({
      outcome: 'REFUSED',
      code: 'MANIFEST_NOT_REPRODUCED',
    });
    expect(
      buildAcquisitionCompanion({
        manifest: forged,
        input: result.input,
        observations: result.acquisition!.observations,
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'MANIFEST_NOT_REPRODUCED' });
    // A builder never runs without the input that reproduces the manifest.
    expect(
      buildAcquisitionCompanion({
        manifest: m,
        input: undefined as unknown as SnapshotScopeInput,
        observations: result.acquisition!.observations,
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'MANIFEST_NOT_REPRODUCED' });
    // Duplicate and conflicting identities, digests recomputed.
    expect(recordSetDigestOf(forgedManifest(m, (e) => e.push(clone(e[0]!))))).toMatchObject({
      outcome: 'REFUSED',
      code: 'DUPLICATE_RECORD_IDENTITY',
    });
    expect(
      recordSetDigestOf(
        forgedManifest(m, (e) => e.push({ ...clone(e[0]!), recordType: 'IDENTITY_CLAIM' })),
      ),
    ).toMatchObject({ outcome: 'REFUSED', code: 'CONFLICTING_RECORD_ENTRY' });
    expect(
      recordSetDigestOf(
        forgedManifest(m, (e) => e.push({ ...clone(e[0]!), contentDigest: '0'.repeat(64) })),
      ),
    ).toMatchObject({ outcome: 'REFUSED', code: 'CONFLICTING_RECORD_ENTRY' });
    const globalTwice = forgedManifest(m, (e) =>
      e.push(clone(e.find((x) => x.recordType === 'SOURCE_GLOBAL')!)),
    );
    expect(recordSetDigestOf(globalTwice)).toMatchObject({
      outcome: 'REFUSED',
      code: 'DUPLICATE_RECORD_IDENTITY',
    });
    // An excluded source global is still checked, never skipped unread.
    const globalAt = (e: SnapshotScopeManifest['membership']['entries'][number][]) =>
      e.findIndex((x) => x.recordType === 'SOURCE_GLOBAL');
    for (const bad of [
      forgedManifest(m, (e) => (e[globalAt(e)] = { ...e[globalAt(e)]!, recordId: 'NEW_GLOBAL' })),
      forgedManifest(m, (e) => (e[globalAt(e)] = { ...e[globalAt(e)]!, recordId: focal })),
      forgedManifest(m, (e) => (e[globalAt(e)] = { ...e[globalAt(e)]!, contentDigest: 'XYZ' })),
    ]) {
      expect(recordSetDigestOf(bad)).toMatchObject({
        outcome: 'REFUSED',
        code: 'MANIFEST_SHAPE_UNSUPPORTED',
      });
    }
    // Malformed entries and manifests.
    for (const bad of [
      forgedManifest(m, (e) => (e[0] = { ...e[0]!, recordType: 'CONTACT' as never })),
      forgedManifest(m, (e) => (e[0] = { ...e[0]!, contentDigest: 'XYZ' })),
      forgedManifest(m, (e) => (e[0] = { ...e[0]!, recordId: 'cand:1' })),
      forgedManifest(m, (e) => (e[0] = { ...e[0]!, extra: 1 } as never)),
    ]) {
      expect(recordSetDigestOf(bad)).toMatchObject({
        outcome: 'REFUSED',
        code: 'MANIFEST_SHAPE_UNSUPPORTED',
      });
    }
    for (const bad of [null, 7, 'manifest', [], {}, { ...m, membership: null }]) {
      expect(recordSetDigestOf(bad).outcome).toBe('REFUSED');
    }
    expect(entries.length).toBeGreaterThan(3);
  });
});

describe('B2.5-M1: bounded enumerations (6-8)', () => {
  it('M1-U8 (6): holders NOT_REQUESTED, EMPTY, EXHAUSTIVE, TRUNCATED and UNKNOWN stay distinct', async () => {
    const cases: [string, (t: Tables, focal: string) => Script, string, number][] = [
      ['no focal identifier', () => ({}), 'NOT_REQUESTED', 0],
      [
        'identifier, no holder',
        (t, f) => (t.identity.push(picRow(f)), {}),
        'EMPTY_AS_OF_SNAPSHOT',
        0,
      ],
      [
        'two holders',
        (t, f) => {
          t.identity.push(picRow(f));
          for (let i = 0; i < 2; i += 1) {
            const h = ascendingId();
            t.subjects.push(subjectRow(h));
            t.identity.push(picRow(h));
          }
          return {};
        },
        'EXHAUSTIVE_AS_OF_SNAPSHOT',
        2,
      ],
      [
        'one holder beyond the cap',
        (t, f) => {
          t.identity.push(picRow(f));
          for (let i = 0; i < HOLDER_QUERY_LIMIT; i += 1) {
            const h = ascendingId();
            t.subjects.push(subjectRow(h));
            t.identity.push(picRow(h));
          }
          return {};
        },
        'TRUNCATED_AT_INCLUDED_CAP',
        HOLDER_INCLUDED_CAP,
      ],
      [
        'an out-of-order holder result',
        (t, f) => {
          t.identity.push(picRow(f));
          for (let i = 0; i < 2; i += 1) {
            const h = ascendingId();
            t.subjects.push(subjectRow(h));
            t.identity.push(picRow(h));
          }
          return { holders: (ids) => [...ids].reverse() };
        },
        'UNKNOWN',
        0,
      ],
    ];
    const statuses = new Set<string>();
    for (const [name, setup, status, included] of cases) {
      const { focal, t } = world();
      const script = setup(t, focal);
      const { a, result } = await acquired(t, focal, script);
      expect(a.holders.status, name).toBe(status);
      expect(a.holders.includedSubjectIds, name).toHaveLength(included);
      expect(a.holders.queryLimit).toBe(HOLDER_QUERY_LIMIT);
      expect(a.holders.includedCap).toBe(HOLDER_INCLUDED_CAP);
      expect(a.holders.sentinelRow).toBe('NEVER_EXPORTED');
      expect(result.manifest.scope.sharedIdentifierHolders.bound).toBe(HOLDER_QUERY_LIMIT);
      expect(a.holders.includedSubjectIds).toEqual(
        result.manifest.scope.sharedIdentifierHolders.holderSubjectIds,
      );
      statuses.add(a.holders.status);
      if (status === 'TRUNCATED_AT_INCLUDED_CAP') {
        expect(a.holders.beyondIncluded).toBe(
          'AT_LEAST_ONE_FURTHER_MATCHING_ROW_EXISTS_NEVER_ENUMERATED',
        );
      }
      if (status === 'UNKNOWN') {
        // The loader kept the rows it could not attribute; they are read, never enumerated.
        expect(
          a.subjectEvidence.subjects.filter((s) => s.depth === 'OUTSIDE_PART_OF_CLOSURE'),
        ).toHaveLength(2);
      }
    }
    expect(statuses.size).toBe(cases.length);
  });

  it('M1-U9 (7): incoming EMPTY, EXHAUSTIVE, TRUNCATED and UNKNOWN stay distinct', async () => {
    const cases: [string, number, Script, string, number][] = [
      ['no incoming claim', 0, {}, 'EMPTY_AS_OF_SNAPSHOT', 0],
      ['three claims', 3, {}, 'EXHAUSTIVE_AS_OF_SNAPSHOT', 3],
      [
        'one claim beyond the cap',
        INCOMING_QUERY_LIMIT,
        {},
        'TRUNCATED_AT_INCLUDED_CAP',
        INCOMING_INCLUDED_CAP,
      ],
      [
        'an out-of-order incoming result',
        3,
        { incoming: (rows) => [...rows].reverse() },
        'UNKNOWN',
        0,
      ],
    ];
    for (const [name, n, script, status, included] of cases) {
      const { focal, t } = world();
      for (let i = 0; i < n; i += 1) incomingFrom(t, focal);
      const { a, result } = await acquired(t, focal, script);
      expect(a.incoming.status, name).toBe(status);
      expect(a.incoming.includedClaimIds, name).toHaveLength(included);
      expect(a.incoming.queryLimit).toBe(INCOMING_QUERY_LIMIT);
      expect(a.incoming.includedCap).toBe(INCOMING_INCLUDED_CAP);
      const declared = result.manifest.scope.categories.INCOMING_RELATIONSHIP_CLAIMS;
      expect(declared).toBe(
        status === 'UNKNOWN'
          ? 'UNKNOWN'
          : status === 'TRUNCATED_AT_INCLUDED_CAP'
            ? 'INCOMPLETE'
            : 'REPRESENTED',
      );
      if (status === 'UNKNOWN') {
        expect(a.sourceSubjects.status).toBe('NOT_REQUESTED_INCOMING_ENUMERATION_UNKNOWN');
        expect(a.claimReviewReads.status).toBe('NOT_REQUESTED_INCOMING_ENUMERATION_UNKNOWN');
        expect(a.claimReviewReads.targets).toEqual([]);
      }
    }
  });

  it('M1-U10 (8): the included cap is never the query limit, and a drifted bound is refused', async () => {
    const { focal, t } = world();
    for (let i = 0; i < INCOMING_QUERY_LIMIT; i += 1) incomingFrom(t, focal);
    const { result, a } = await acquired(t, focal);
    expect(INCOMING_QUERY_LIMIT).toBe(INCOMING_INCLUDED_CAP + 1);
    expect(HOLDER_QUERY_LIMIT).toBe(HOLDER_INCLUDED_CAP + 1);
    expect(HOLDER_INCLUDED_CAP).toBe(MAX_SHARED_IDENTIFIER_HOLDERS);
    expect(a.incoming.includedClaimIds).toHaveLength(20);
    expect(a.observations.incomingQuery.queryLimit).toBe(21);
    for (const [path, value] of [
      ['incomingQuery.queryLimit', 20],
      ['incomingQuery.includedCap', 21],
      ['holderQuery.queryLimit', 20],
      ['holderQuery.includedCap', 19],
    ] as const) {
      const [section, key] = path.split('.') as [keyof AcquisitionObservations, string];
      expect(
        rebuild(result, (o) => ((o[section] as unknown as Record<string, unknown>)[key] = value)),
        path,
      ).toMatchObject({ outcome: 'REFUSED', code: 'READ_PROTOCOL_MISMATCH' });
    }
    // A TRUNCATED report below the cap is not a truncation.
    expect(
      rebuild(result, (o) => {
        (o.incomingQuery as unknown as { includedClaims: unknown[] }).includedClaims.pop();
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'OBSERVATION_INCONSISTENT' });
  });
});

describe('B2.5-M1: source subjects and evidence depth (9-10)', () => {
  it('M1-U11 (9): a row-only source subject is never equivalent to one the base graph read', async () => {
    const { focal, t } = world();
    t.identity.push(picRow(focal));
    // A: a fresh source, read by id as a bare row.
    const fresh = incomingFrom(t, focal);
    // B: a source that is also a shared-identifier holder (identity claims read).
    const holder = incomingFrom(t, focal);
    t.identity.push(picRow(holder.source));
    // C: a PART_OF closure member whose own non-PART_OF claim targets the focal subject.
    const parent = ascendingId();
    t.subjects.push(subjectRow(parent));
    t.identity.push(claimRow(parent));
    t.relationships.push(relation(focal, 'PART_OF', parent));
    const fromParent = relation(parent, 'AFFILIATED_WITH', focal);
    t.relationships.push(fromParent);
    const { a } = await acquired(t, focal);
    const bySubject = new Map(a.sourceSubjects.subjects.map((s) => [s.subjectId, s]));
    expect(bySubject.get(fresh.source)).toMatchObject({
      acquisition: 'ROW_ONLY_READ_BY_EXACT_ID',
      evidenceDepth: 'ROW_ONLY',
      suppliedToManifest: true,
    });
    expect(bySubject.get(holder.source)).toMatchObject({
      acquisition: 'HELD_BY_BASE_GRAPH',
      evidenceDepth: 'OUTSIDE_PART_OF_CLOSURE',
    });
    expect(bySubject.get(parent)).toMatchObject({
      acquisition: 'HELD_BY_BASE_GRAPH',
      evidenceDepth: 'PART_OF_CLOSURE_MEMBER',
    });
    expect(a.sourceSubjects.rowOnlySubjectIds).toEqual([fresh.source]);
    expect(a.sourceSubjects.requestedSubjectIds).toEqual([fresh.source]);
    const depth = new Map(a.subjectEvidence.subjects.map((s) => [s.subjectId, s.depth]));
    expect(depth.get(focal)).toBe('FOCAL_SUBJECT');
    expect(depth.get(fresh.source)).toBe('ROW_ONLY');
    expect(new Set(depth.values()).size).toBe(4);
    expect(a.subjectEvidence.examination).toBe('NO_SUBJECT_IS_STATED_COMPLETELY_EXAMINED');
    expect(strings(a.subjectEvidence)).not.toContain('COMPLETE');
  });

  it('M1-U12 (10): absent and unknown source-subject reads stay unread, never supplied', async () => {
    for (const [name, script, acquisition, status] of [
      [
        'one row absent',
        { sources: (rows: Row[]) => rows.slice(1) },
        'NOT_READ_ABSENT_FROM_SNAPSHOT',
        'REQUESTED_ROWS_ABSENT',
      ],
      [
        'an out-of-order result',
        { sources: (rows: Row[]) => [...rows].reverse() },
        'NOT_READ_RESULT_UNKNOWN',
        'UNKNOWN',
      ],
    ] as const) {
      const { focal, t } = world();
      const one = incomingFrom(t, focal);
      const two = incomingFrom(t, focal);
      const { a, result } = await acquired(t, focal, script);
      expect(a.sourceSubjects.status, name).toBe(status);
      const unread = a.sourceSubjects.subjects.filter((s) => s.acquisition === acquisition);
      expect(unread.length, name).toBeGreaterThan(0);
      for (const s of unread) {
        expect(s.evidenceDepth).toBe('NOT_READ');
        expect(s.suppliedToManifest).toBe(false);
        expect(a.sourceSubjects.unreadSubjectIds).toContain(s.subjectId);
      }
      expect(a.sourceSubjects.requestedSubjectIds).toEqual([one.source, two.source].sort());
      expect(result.manifest.scope.categories.REFERENCED_RECORDS).toBe('INCOMPLETE');
    }
  });
});

describe('B2.5-M1: incoming-claim review reads (11-12)', () => {
  it('M1-U13 (11): NOT_REQUESTED, ZERO_MATCHING_ROWS, COMPLETE_AS_OF_SNAPSHOT and UNKNOWN stay distinct', async () => {
    const { focal, t } = world();
    const none = incomingFrom(t, focal);
    const reviewed = incomingFrom(t, focal);
    t.reviews.push(reviewOfClaim(reviewed.claim));
    // A claim the base graph holds: a PART_OF claim of a closure member targeting the focal subject.
    const parent = ascendingId();
    t.subjects.push(subjectRow(parent));
    t.identity.push(claimRow(parent));
    t.relationships.push(relation(focal, 'PART_OF', parent));
    const held = relation(parent, 'PART_OF', focal);
    t.relationships.push(held);
    const { a } = await acquired(t, focal);
    const status = new Map(a.claimReviewReads.targets.map((x) => [x.claimId, x.status]));
    expect(status.get(none.claim)).toBe('ZERO_MATCHING_ROWS');
    expect(status.get(reviewed.claim)).toBe('COMPLETE_AS_OF_SNAPSHOT');
    expect(status.get(held.id as string)).toBe('NOT_REQUESTED');
    expect(a.claimReviewReads.requestedClaimIds).toEqual([none.claim, reviewed.claim].sort());
    expect(a.claimReviewReads.statementRowBound).toBe(REVIEW_STATEMENT_ROW_BOUND);
    expect(REVIEW_STATEMENT_ROW_BOUND).toBe(MAX_GRAPH_ROWS);
    expect(a.claimReviewReads.headReview).toBe('NOT_PROVEN_LATEST_SOURCE_TAIL_UNKNOWN');

    const unknown = await acquired(t, focal, { claimReviews: (rows) => [...rows, ...rows] });
    expect(unknown.a.claimReviewReads.status).toBe('UNKNOWN');
    for (const x of unknown.a.claimReviewReads.targets) {
      expect(x.status).toBe(x.claimId === held.id ? 'NOT_REQUESTED' : 'UNKNOWN');
      expect(x.reviewIds).toEqual([]);
    }
    expect(unknown.result.manifest.scope.categories.REVIEW_RECORDS).toBe('INCOMPLETE');
  });

  it('M1-U14 (12): superseded stored reviews and missing attestation references are stated, not repaired', async () => {
    const { focal, t } = world();
    const { claim } = incomingFrom(t, focal);
    const first = reviewOfClaim(claim);
    const second = reviewOfClaim(claim, first.id as string);
    t.reviews.push(first, second);
    const attested = attestationOf(second.id as string);
    t.attestations.push(attested);
    const { a, result } = await acquired(t, focal);
    const target = a.claimReviewReads.targets.find((x) => x.claimId === claim)!;
    expect(target).toMatchObject({
      status: 'COMPLETE_AS_OF_SNAPSHOT',
      reviewIds: [first.id, second.id],
      supersededReviewIds: [first.id],
      attestationReferenceIds: [attested.id],
      reviewIdsWithoutAttestationReference: [first.id],
    });
    expect(result.manifest.reviews.latestReview).toBe('NOT_PROVEN');
    expect(a.authenticity.latestReview).toBe('NOT_PROVEN');
    expect(a.authenticity.reviewHeadAsOfSnapshot).toBe('NOT_STATED');
    expect(a.authenticity.signatureVerification).toBe('NOT_PERFORMED');
  });
});

describe('B2.5-M1: validation and the authenticity boundary (13-15)', () => {
  it('M1-U15 (13): INPUT and FOCAL findings are published, NEIGHBOUR diagnostics withheld by policy and digest-bound', async () => {
    const { focal, t } = world(false);
    incomingFrom(t, focal, false);
    const { a, result } = await acquired(t, focal, {}, 'RUN');
    const report = result.validation!;
    expect(a.validation.execution).toBe('RAN_IN_THE_ASSEMBLY_ASSEMBLER_REPORTED');
    expect(a.validation.ruleVersion).toBe('discovery-identity-rules-v1');
    expect(a.validation.coverage).toEqual({
      INPUT: 'REPRESENTED',
      FOCAL_RECORD: report.focalCoverage,
      NEIGHBOUR_RECORD: 'WITHHELD_BY_POLICY',
      UNSUPPLIED_RECORD: 'WITHHELD_BY_POLICY',
    });
    expect(a.validation.publishedFindingCount).toEqual(report.publishedFindingCount);
    expect(a.validation.publishedFindingCount.focalRecord).toBeGreaterThan(0);
    expect(a.validation.withheld.neighbourRecord).toBe(
      report.withheld.diagnostics.filter((d) => d.partition === 'NEIGHBOUR_RECORD').length,
    );
    expect(a.validation.withheld.neighbourRecord).toBeGreaterThan(0);
    expect(a.validation.withheld.status).toBe(
      'UNTRUSTED_DIAGNOSTICS_NOT_FINDINGS_NOT_IN_THE_MANIFEST',
    );
    expect(
      result.manifest.validation.findings.every((f) =>
        ['INPUT', 'FOCAL_RECORD'].includes(f.partition),
      ),
    ).toBe(true);
    // The withheld diagnostics are digest-bound - but they are assembler-reported and
    // never in the manifest, so a companion that omits them still builds: binding is
    // not authentication.
    const other = rebuild(result, (o) => {
      (o.validation as unknown as { withheld: unknown[] }).withheld = [];
    });
    if (other.outcome !== 'BUILT') throw new Error(`refused ${JSON.stringify(other)}`);
    expect(other.companion.validation.withheld.neighbourRecord).toBe(0);
    expect(other.companion.validation.withheld.diagnosticsDigest).not.toBe(
      a.validation.withheld.diagnosticsDigest,
    );
    expect(other.companion.acquisitionDigest).not.toBe(a.acquisitionDigest);
    expect(other.companion.binding.recordSetDigest).toBe(a.binding.recordSetDigest);
    // A withheld diagnostic relabelled across partitions contradicts the membership.
    expect(
      rebuild(result, (o) => {
        const w = (o.validation as unknown as { withheld: { partition: string }[] }).withheld;
        w[0]!.partition = 'UNSUPPLIED_RECORD';
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'OBSERVATION_INCONSISTENT_WITH_MANIFEST' });
  });

  it('M1-U16 (13b): the not-run read binds no coverage and refuses a claimed run', async () => {
    const { focal, t } = world(false);
    incomingFrom(t, focal, false);
    const { a, result } = await acquired(t, focal);
    expect(a.validation.execution).toBe('NOT_RUN');
    expect(a.validation.coverage.FOCAL_RECORD).toBe('NOT_RUN');
    expect(
      rebuild(result, (o) => {
        (o as Record<string, unknown>)['validation'] = {
          ruleVersion: 'discovery-identity-rules-v1',
          focalCoverage: 'REPRESENTED',
          focalCoverageGaps: [],
          withheld: [],
        };
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'OBSERVATION_INCONSISTENT_WITH_MANIFEST' });
  });

  it('M1-U17 (14, 15): no empty finding set or consistent digest promotes coverage or grants anything', async () => {
    const { focal, t } = world();
    const { a } = await acquired(t, focal, {}, 'RUN');
    expect(a.validation.publishedFindingCount).toEqual({ input: 0, focalRecord: 0 });
    expect(
      verifyAcquisitionCompanion(a, (await acquired(t, focal, {}, 'RUN')).result.manifest),
    ).toMatchObject({
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
      queryExecution: 'NOT_PROVEN_BY_ANY_DIGEST',
    });
    expect(a.authenticity).toEqual(AUTHENTICITY);
    expect(a.authenticity).toMatchObject({
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
      reviewerTrust: 'NONE_ESTABLISHED',
      protectionCheck: 'NOT_CONSULTED',
      protectionVerdict: 'UNKNOWN',
      observations: 'ASSEMBLER_REPORTED_NOT_INDEPENDENTLY_AUTHENTICATED',
      durableSourceRevision: 'NONE',
    });
    expect(Object.values(a.permissions)).toEqual(Object.values(PERMISSIONS).map(() => 'NONE'));
    expect(a.canonicalIssuer).toEqual({ producerMayIssue: 'NONE', identifiersIssuedHere: 'NONE' });
    expect(a.clock.serverClock).toBe('WALL_CLOCK_NOT_MONOTONIC_MAY_STEP_BACKWARDS');
    expect(a.readProtocol.consistency).toBe(
      'TRANSACTION_CONSISTENT_READ_NOT_A_DURABLE_SOURCE_REVISION',
    );
    const values = strings(a);
    for (const stronger of [
      'COMPLETE',
      'VERIFIED',
      'AUTHENTICATED',
      'FRESH',
      'CURRENT',
      'TRUSTED',
      'GRANTED',
      'ALLOWED',
      'ELIGIBLE',
      'APPROVED',
      'NOT_PROTECTED',
      'INDEPENDENT',
      'LATEST',
    ]) {
      expect(values, stronger).not.toContain(stronger);
    }
    expect(values.some((v) => /^(cand|chn|opp):/i.test(v))).toBe(false);
    expect(JSON.stringify(a)).not.toMatch(/SAME_ACTOR|discovery-subject-evidence|nwf-identity\./);
  });
});

describe('B2.5-M1: the companion boundary (17)', () => {
  it('M1-U18: the companion is its own B-local contract, references S0 by digest only and fixes its read protocol', async () => {
    const { focal, t } = world();
    const { a, result } = await acquired(t, focal);
    expect(a.contract).toBe(ACQUISITION_COMPANION_CONTRACT);
    expect(a.contract).not.toBe(result.manifest.contract);
    expect(a.contractStatus).toBe('B_LOCAL_PROVISIONAL_NOT_A_CROSS_TRACK_CONTRACT');
    expect(a.binding.snapshotContract).toBe(result.manifest.contract);
    expect(a.binding.snapshotManifestDigest).toBe(result.manifest.manifestDigest);
    expect(a.authenticity.handoff).toBe(
      'NOT_PART_OF_THE_B2_4_EVIDENCE_COMPANION_OR_THE_H1_HANDOFF',
    );
    // The restated read-protocol limitations are the assembler's own, minus the validator note.
    expect([...READ_PROTOCOL.loaderLimitations]).toEqual(
      SNAPSHOT_READ_FACTS.loaderLimitations.filter((l) => l !== 'VALIDATOR_NOT_RUN'),
    );
    expect(READ_PROTOCOL.durableSourceRevision).toBe(SNAPSHOT_READ_FACTS.durableSourceRevision);
    expect(READ_PROTOCOL.transactionEnd).toBe(SNAPSHOT_READ_FACTS.transactionEnd);
    expect(READ_PROTOCOL.transactionSnapshot).toBe(SNAPSHOT_READ_FACTS.transactionSnapshot);
    // The manifest does not carry the companion; the companion does not replace any S0 digest.
    expect(result.canonical).not.toContain(a.acquisitionDigest);
    expect(result.canonical).not.toContain(a.binding.recordSetDigest);
    expect(a.binding.recordSetDigest).not.toBe(result.manifest.membership.membershipDigest);
  });
});

describe('B2.5-M1: digest verification and focused negative mutations', () => {
  async function fixture() {
    const { focal, t } = world();
    t.identity.push(picRow(focal));
    const holder = ascendingId();
    t.subjects.push(subjectRow(holder));
    t.identity.push(picRow(holder), claimRow(holder));
    const one = incomingFrom(t, focal);
    const two = incomingFrom(t, focal);
    const first = reviewOfClaim(one.claim);
    t.reviews.push(first, reviewOfClaim(one.claim, first.id as string));
    t.attestations.push(attestationOf(first.id as string));
    const { result, a } = await acquired(t, focal, {}, 'RUN');
    return { result, a, focal, holder, one, two };
  }

  it('M1-U19: a built companion verifies, reproduces, and is neither self-referential nor order-dependent', async () => {
    const { result, a } = await fixture();
    expect(verifyAcquisitionCompanion(a, result.manifest).contentDigestConsistency).toBe(
      'CONSISTENT',
    );
    expect(reproduceAcquisitionCompanion(a, result.manifest, result.input)).toBe('REPRODUCED');
    const { acquisitionDigest, ...body } = a;
    expect(acquisitionDigestOfBody(body)).toBe(acquisitionDigest);
    expect(JSON.stringify(body)).not.toContain(acquisitionDigest);
    // Reordered observation lists build the same bytes.
    const again = rebuild(result, (o) => {
      (o.baseGraph.subjectIds as string[]).reverse();
      (o.incomingQuery.includedClaims as unknown[]).reverse();
      (o.claimReviewRead.reviews as unknown[]).reverse();
    });
    const original = buildAcquisitionCompanion({
      manifest: result.manifest,
      input: result.input,
      observations: a.observations,
    });
    if (again.outcome !== 'BUILT' || original.outcome !== 'BUILT') throw new Error('refused');
    expect(again.canonical).toBe(original.canonical);
    expect(JSON.parse(original.canonical)).toEqual(JSON.parse(JSON.stringify(a)));
  });

  it.each([
    [
      'a missing observation section',
      (o: Record<string, unknown>): void => {
        delete o['claimReviewRead'];
      },
      'OBSERVATION_SHAPE_UNSUPPORTED',
    ],
    [
      'a null observation section',
      (o: Record<string, unknown>): void => {
        o['holderQuery'] = null;
      },
      'OBSERVATION_MISSING',
    ],
    [
      'a missing field',
      (o: Record<string, unknown>): void => {
        delete (o['sourceRowRead'] as Record<string, unknown>)['unreadSubjectIds'];
      },
      'OBSERVATION_SHAPE_UNSUPPORTED',
    ],
    [
      'an extra field',
      (o: Record<string, unknown>): void => {
        (o['incomingQuery'] as Record<string, unknown>)['complete'] = true;
      },
      'OBSERVATION_SHAPE_UNSUPPORTED',
    ],
  ] as const)('M1-U20: refuses %s', async (_, mutate, code) => {
    const { result } = await fixture();
    expect(
      rebuild(result, mutate as (o: AcquisitionObservations & Record<string, unknown>) => void),
    ).toMatchObject({
      outcome: 'REFUSED',
      code,
    });
  });

  it('M1-U21: refuses forged completeness', async () => {
    const { result, holder } = await fixture();
    const forgeries: [
      string,
      (o: AcquisitionObservations & Record<string, unknown>) => void,
      string,
    ][] = [
      [
        'holders called truncated over a non-truncated set',
        (o) => {
          Object.assign(o.holderQuery, {
            outcome: 'TRUNCATED',
            basis: 'QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP',
          });
        },
        'OBSERVATION_INCONSISTENT',
      ],
      [
        'holders called not requested over a focal identifier',
        (o) => {
          Object.assign(o.holderQuery, {
            basis: 'NO_FOCAL_EXTERNAL_IDENTIFIER',
            includedSubjectIds: [],
          });
        },
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a holder dropped from an exhaustive enumeration',
        (o) => {
          (o.holderQuery as unknown as { includedSubjectIds: string[] }).includedSubjectIds = [];
        },
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a mismatched outcome and basis',
        (o) => {
          Object.assign(o.incomingQuery, { basis: 'QUERY_RETURNED_A_ROW_BEYOND_THE_INCLUDED_CAP' });
        },
        'OBSERVATION_INCONSISTENT',
      ],
      [
        'an incoming claim dropped from an exhaustive enumeration',
        (o) => {
          (o.incomingQuery.includedClaims as unknown[]).pop();
        },
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a row-only source promoted into the base graph',
        (o) => {
          const id = o.sourceRowRead.readSubjectIds[0]!;
          (o.baseGraph.subjectIds as string[]).push(id);
          Object.assign(o.sourceRowRead, {
            requestedSubjectIds: o.sourceRowRead.requestedSubjectIds.filter((x) => x !== id),
            readSubjectIds: o.sourceRowRead.readSubjectIds.filter((x) => x !== id),
          });
        },
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a holder subject the manifest does not hold',
        (o) => {
          (o.baseGraph.subjectIds as string[]).splice(o.baseGraph.subjectIds.indexOf(holder), 1);
        },
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
    ];
    for (const [name, forge, code] of forgeries) {
      expect(rebuild(result, forge), name).toMatchObject({ outcome: 'REFUSED', code });
    }
  });

  it('M1-U22: refuses omitted or invented source subject ids', async () => {
    const { result, two } = await fixture();
    for (const [name, forge] of [
      [
        'an omitted requested id',
        (o: AcquisitionObservations) => {
          Object.assign(o.sourceRowRead, {
            requestedSubjectIds: o.sourceRowRead.requestedSubjectIds.filter(
              (x) => x !== two.source,
            ),
            readSubjectIds: o.sourceRowRead.readSubjectIds.filter((x) => x !== two.source),
          });
        },
      ],
      [
        'a read id moved to unread',
        (o: AcquisitionObservations) => {
          Object.assign(o.sourceRowRead, {
            outcome: 'REQUESTED_ROWS_ABSENT',
            readSubjectIds: o.sourceRowRead.readSubjectIds.filter((x) => x !== two.source),
            unreadSubjectIds: [two.source],
          });
        },
      ],
      [
        'an invented request',
        (o: AcquisitionObservations) => {
          Object.assign(o.sourceRowRead, {
            requestedSubjectIds: [
              ...o.sourceRowRead.requestedSubjectIds,
              'ffffffff-0000-4000-8000-000000000001',
            ].sort(),
            unreadSubjectIds: ['ffffffff-0000-4000-8000-000000000001'],
            outcome: 'REQUESTED_ROWS_ABSENT',
          });
        },
      ],
    ] as const) {
      expect(rebuild(result, forge as never), name).toMatchObject({
        outcome: 'REFUSED',
        code: 'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      });
    }
    expect(
      rebuild(result, (o) => {
        (o.sourceRowRead as unknown as { readSubjectIds: string[] }).readSubjectIds.push(
          two.source,
        );
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'OBSERVATION_SHAPE_UNSUPPORTED' });
  });

  it('M1-U23: refuses a wrong review-read status, and a recomputed forgery fails reproduction', async () => {
    const { result, a, one } = await fixture();
    for (const [name, forge, code] of [
      [
        'an UNKNOWN read that kept its rows',
        (o: AcquisitionObservations) => Object.assign(o.claimReviewRead, { outcome: 'UNKNOWN' }),
        'OBSERVATION_INCONSISTENT',
      ],
      [
        'a read review dropped',
        (o: AcquisitionObservations) => (o.claimReviewRead.reviews as unknown[]).pop(),
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a predecessor dropped',
        (o: AcquisitionObservations) => (o.claimReviewRead.reviews as unknown[]).shift(),
        'OBSERVATION_INCONSISTENT',
      ],
      [
        'every review dropped (claimed zero rows)',
        (o: AcquisitionObservations) =>
          Object.assign(o.claimReviewRead, { reviews: [], attestationReferences: [] }),
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'an attestation reference dropped',
        (o: AcquisitionObservations) =>
          Object.assign(o.claimReviewRead, { attestationReferences: [] }),
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a claim removed from the request',
        (o: AcquisitionObservations) =>
          Object.assign(o.claimReviewRead, {
            requestedClaimIds: o.claimReviewRead.requestedClaimIds.filter((x) => x !== one.claim),
            reviews: [],
            attestationReferences: [],
          }),
        'OBSERVATION_INCONSISTENT_WITH_MANIFEST',
      ],
      [
        'a NONE_REQUESTED read over requested claims',
        (o: AcquisitionObservations) =>
          Object.assign(o.claimReviewRead, {
            outcome: 'NONE_REQUESTED',
            reviews: [],
            attestationReferences: [],
          }),
        'OBSERVATION_INCONSISTENT',
      ],
    ] as const) {
      expect(rebuild(result, forge as never), name).toMatchObject({ outcome: 'REFUSED', code });
    }
    // A status edited in the companion, with its digest recomputed: digest-consistent
    // (nothing here authenticates it) but it does not reproduce from its observations.
    const forged = clone(a) as unknown as {
      claimReviewReads: { targets: { status: string }[] };
      acquisitionDigest: string;
    };
    forged.claimReviewReads.targets[0]!.status = 'ZERO_MATCHING_ROWS';
    const { acquisitionDigest: _old, ...body } = forged as unknown as AcquisitionCompanion;
    forged.acquisitionDigest = acquisitionDigestOfBody(body);
    expect(verifyAcquisitionCompanion(forged, result.manifest).contentDigestConsistency).toBe(
      'CONSISTENT',
    );
    expect(
      reproduceAcquisitionCompanion(
        forged as unknown as AcquisitionCompanion,
        result.manifest,
        result.input,
      ),
    ).toBe('NOT_REPRODUCED');
  });

  it('M1-U25: refuses an exhaustive enumeration missing a claim the base graph already holds', async () => {
    const { focal, t } = world();
    const parent = ascendingId();
    t.subjects.push(subjectRow(parent));
    t.identity.push(claimRow(parent));
    t.relationships.push(relation(focal, 'PART_OF', parent));
    const held = relation(parent, 'PART_OF', focal);
    t.relationships.push(held);
    const { result, a } = await acquired(t, focal);
    expect(a.incoming.includedClaimIds).toEqual([held.id]);
    expect(a.sourceSubjects.requestedSubjectIds).toEqual([]);
    expect(a.claimReviewReads.requestedClaimIds).toEqual([]);
    // Nothing else is requested for a held claim, so only the exhaustiveness check can see it.
    expect(
      rebuild(result, (o) => {
        (o.incomingQuery as unknown as { includedClaims: unknown[] }).includedClaims = [];
      }),
    ).toMatchObject({ outcome: 'REFUSED', code: 'OBSERVATION_INCONSISTENT_WITH_MANIFEST' });
  });

  it('M1-U26: a companion the builder refuses makes the assembly return nothing', async () => {
    const { focal, t } = world();
    const stray = ascendingId();
    t.subjects.push(subjectRow(stray));
    // A non-conforming subject statement returns a row no reported read asked for.
    const script: Script = {
      graphSubjects: (rows) => [...rows, ...t.subjects.filter((s) => s.id === stray)],
    };
    const plain = connectionSource(t, script);
    expect(built(await assembleSubjectSnapshotScope(plain.source, focal)).manifest).toBeDefined();
    const c = connectionSource(t, script);
    await expect(
      assembleSubjectSnapshotScope(c.source, focal, { acquisitionCompanion: 'BUILD' }),
    ).rejects.toThrow(
      'the acquisition companion was refused: OBSERVATION_INCONSISTENT_WITH_MANIFEST (baseGraph.unattributed_subject)',
    );
    expect(c.sql.at(-1)).toBe('ROLLBACK');
  });

  it('M1-U24: digest tampering is detected', async () => {
    const { result, a } = await fixture();
    const cases: [string, (c: Record<string, unknown>) => void, string][] = [
      ['acquisition digest', (c) => (c['acquisitionDigest'] = '0'.repeat(64)), 'acquisitionDigest'],
      [
        'record-set digest',
        (c) => ((c['binding'] as Record<string, unknown>)['recordSetDigest'] = '0'.repeat(64)),
        'acquisitionDigest',
      ],
      [
        'an authenticity statement',
        (c) => ((c['authenticity'] as Record<string, unknown>)['sourceCompleteness'] = 'PROVEN'),
        'authenticity',
      ],
      [
        'a permission',
        (c) => ((c['permissions'] as Record<string, unknown>)['outreach'] = 'GRANTED'),
        'permissions',
      ],
    ];
    for (const [name, tamper, finding] of cases) {
      const c = clone(a) as unknown as Record<string, unknown>;
      tamper(c);
      const v = verifyAcquisitionCompanion(c, result.manifest);
      expect(v.contentDigestConsistency, name).toBe('INCONSISTENT');
      expect(v.inconsistencies, name).toContain(finding);
      expect(v.sourceCompleteness).toBe('NOT_PROVEN');
    }
    // Recomputed record-set digest that no longer matches the manifest.
    const c = clone(a) as unknown as AcquisitionCompanion & {
      binding: { recordSetDigest: string };
      acquisitionDigest: string;
    };
    c.binding.recordSetDigest = '1'.repeat(64);
    const { acquisitionDigest: _x, ...body } = c;
    c.acquisitionDigest = acquisitionDigestOfBody(body);
    expect(verifyAcquisitionCompanion(c, result.manifest).inconsistencies).toEqual([
      'recordSetDigest',
    ]);
    // A recomputed companion stating another record count or another record-set rule.
    const restated: [string, (b: Record<string, unknown>) => void][] = [
      ['recordCount', (b) => (b['recordCount'] = (b['recordCount'] as number) + 1)],
      [
        'recordSetRule',
        (b) =>
          (b['recordSetRule'] = {
            ...(b['recordSetRule'] as Record<string, unknown>),
            excludedMembership: ['SOURCE_GLOBAL:VALIDATION_AS_OF'],
          }),
      ],
    ];
    for (const [finding, edit] of restated) {
      const r = clone(a) as unknown as Record<string, unknown> & { acquisitionDigest: string };
      edit(r['binding'] as Record<string, unknown>);
      const { acquisitionDigest: _y, ...rBody } = r;
      r.acquisitionDigest = acquisitionDigestOfBody(rBody as never);
      expect(verifyAcquisitionCompanion(r, result.manifest).inconsistencies).toEqual([finding]);
    }
    // Against another read's manifest: the manifest reference no longer matches.
    const { focal, t } = world();
    const otherManifest = (await acquired(t, focal)).result.manifest;
    expect(verifyAcquisitionCompanion(a, otherManifest).inconsistencies).toEqual(
      expect.arrayContaining(['recordSetDigest', 'snapshotManifestDigest']),
    );
    expect(verifyAcquisitionCompanion(null, result.manifest).inconsistencies).toEqual(['shape']);
  });
});
