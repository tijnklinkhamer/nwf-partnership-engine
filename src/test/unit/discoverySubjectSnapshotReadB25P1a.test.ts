/**
 * Track B, B2.5-P1a - the transaction-bound snapshot assembler, WITHOUT a
 * database: one in-memory connection that answers exactly the B2.2 loader's
 * SELECTs over synthetic rows and scripts the server's transaction state.
 * This proves the protocol order, every refusal and rollback path, and the
 * mapping into the unmodified S0 manifest input. That the server genuinely
 * holds one snapshot is proven against real PostgreSQL by
 * src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { MAX_SHARED_IDENTIFIER_HOLDERS } from '../../orgunits/subjectRegistry/store.js';
import {
  SCOPE_CATEGORIES,
  SNAPSHOT_SCOPE_CONTRACT,
} from '../../orgunits/subjectSnapshot/contract.js';
import { verifySnapshotScopeManifest } from '../../orgunits/subjectSnapshot/manifest.js';
import {
  SCOPE_DECLARATIONS,
  SCOPE_DECLARATION_BASIS,
  SNAPSHOT_READ_FACTS,
  SNAPSHOT_READ_REFUSAL_CODES,
  SubjectSnapshotReadRefusal,
  assembleSubjectSnapshotScope,
  type SnapshotReadConnection,
  type SnapshotReadConnectionSource,
  type SubjectSnapshotReadResult,
} from '../../orgunits/subjectSnapshotRead/assemble.js';

const NOW = '2026-10-17T12:00:00.000000Z';
const OBSERVED = '2026-10-01T09:00:00.000000Z';
const ENVIRONMENT = '00000000-0000-4000-8000-0000000000e1';
const GOOD_STATE = {
  isolation: 'repeatable read',
  read_only: 'on',
  snapshot: '764:764:',
  started: '2026-10-17 12:00:00.000001+00',
};

type Row = Record<string, unknown>;
interface Tables {
  subjects: Row[];
  identity: Row[];
  relationships: Row[];
  reviews: Row[];
  attestations: Row[];
  organisations: string[];
}

const provenance = {
  source_type: 'PUBLIC_URL',
  source_page_evidence_id: null,
  source_website_claim_id: null,
  source_url: 'https://synthetic-p1a.example/unit',
  source_version_ref: null,
  observed_at: OBSERVED,
  claim_basis: 'SOURCE_STATED',
  recorded_by_actor_key: 'p1a-synthetic',
  created_at: OBSERVED,
};
const subjectRow = (id: string, note: string | null = null): Row => ({
  id,
  registered_kind: 'UNCERTAIN',
  registered_by_actor_key: 'p1a-synthetic',
  registration_note: note,
  created_at: OBSERVED,
});
const claimRow = (subjectId: string, kind: string, extra: Row): Row => ({
  id: randomUUID(),
  subject_id: subjectId,
  claim_kind: kind,
  name_text: null,
  name_language: null,
  claimed_kind: null,
  website_url: null,
  identifier_scheme: null,
  identifier_value: null,
  ...provenance,
  ...extra,
});
const relationshipRow = (from: string, predicate: string, target: Row): Row => ({
  id: randomUUID(),
  subject_id: from,
  predicate,
  target_subject_id: null,
  target_eche_row_key: null,
  ...provenance,
  ...target,
});

interface FakeOptions {
  readonly tables: Tables;
  readonly noOpenBlock?: unknown;
  readonly states?: readonly (Row | null)[];
  /** A statement pattern that fails when sent. */
  readonly failOn?: RegExp;
  /** The error `failOn` throws, when a specific one is needed. */
  readonly failWith?: Error;
  /** Every ROLLBACK fails. */
  readonly failRollback?: boolean;
}

/** One in-memory connection answering exactly the loader's SELECTs. */
function fake(options: FakeOptions) {
  const t = options.tables;
  const log = { connects: 0, sql: [] as string[], releases: [] as unknown[] };
  let stateReads = 0;
  const answer = (sql: string, v: unknown[]): Row[] => {
    if (options.failOn?.test(sql)) {
      throw options.failWith ?? new Error(`synthetic failure: ${sql.slice(0, 24)}`);
    }
    if (sql.includes('no_open_block')) {
      return options.noOpenBlock === undefined
        ? [{ no_open_block: true }]
        : (options.noOpenBlock as Row[]);
    }
    if (sql.startsWith('BEGIN')) return [];
    if (sql === 'ROLLBACK') {
      if (options.failRollback) throw new Error('synthetic rollback failure');
      return [];
    }
    if (sql.includes("current_setting('transaction_isolation')")) {
      const scripted = options.states !== undefined && stateReads < options.states.length;
      const state = scripted ? options.states![stateReads]! : GOOD_STATE;
      stateReads += 1;
      return state === null ? [] : [state];
    }
    if (sql.includes('clock_timestamp()')) return [{ now: NOW }];
    if (/SELECT 1 FROM discovery_subjects WHERE id = \$1/.test(sql)) {
      return t.subjects.some((s) => s.id === v[0]) ? [{ '?column?': 1 }] : [];
    }
    if (sql.includes('WHERE target_subject_id = $1')) {
      // B2.5-P1c: the direct incoming claims, in id order, under the LIMIT.
      return t.relationships
        .filter((r) => r.target_subject_id === v[0] && r.subject_id !== v[0])
        .sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))
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
      return t.identity
        .filter((c) => c.subject_id === v[0] && c.claim_kind === 'EXTERNAL_IDENTIFIER')
        .map((c) => ({ scheme: c.identifier_scheme, value: c.identifier_value }));
    }
    if (sql.includes('SELECT DISTINCT subject_id FROM discovery_subject_identity_claims')) {
      const keys = (v[0] as string[]).map((s, i) => `${s}|${(v[1] as string[])[i]}`);
      const ids = t.identity
        .filter(
          (c) =>
            c.claim_kind === 'EXTERNAL_IDENTIFIER' &&
            c.subject_id !== v[2] &&
            keys.includes(`${c.identifier_scheme}|${c.identifier_value}`),
        )
        .map((c) => c.subject_id as string);
      return [...new Set(ids)]
        .sort()
        .slice(0, v[3] as number)
        .map((subject_id) => ({ subject_id }));
    }
    if (sql.includes('FROM discovery_subjects WHERE id = ANY')) {
      return t.subjects.filter((s) => (v[0] as string[]).includes(s.id as string));
    }
    if (sql.includes('FROM discovery_subject_identity_claims')) {
      return t.identity.filter((c) => (v[0] as string[]).includes(c.subject_id as string));
    }
    if (sql.includes('FROM discovery_subject_reviews')) {
      return t.reviews.filter((r) => (v[0] as string[]).includes(r.target as string));
    }
    if (sql.includes('FROM organisations')) {
      return t.organisations
        .filter((k) => (v[0] as string[]).includes(k))
        .map((eche_row_key) => ({ eche_row_key }));
    }
    if (sql.includes('FROM subject_review_environment')) return [{ environment_id: ENVIRONMENT }];
    if (sql.includes('SELECT nonce, count(*)::int AS uses')) {
      return (v[0] as string[]).map((nonce) => ({ nonce, uses: 1 }));
    }
    if (sql.includes('FROM subject_review_attestations')) {
      return t.attestations.filter((a) => (v[0] as string[]).includes(a.review_id as string));
    }
    throw new Error(`unscripted statement: ${sql}`);
  };
  const connection = {
    query: (async (text: string, values: unknown[] = []) => {
      log.sql.push(text);
      return { rows: answer(text, values) };
    }) as unknown as SnapshotReadConnection['query'],
    release: (destroy?: boolean | Error) => void log.releases.push(destroy),
  };
  const source: SnapshotReadConnectionSource = {
    connect: async () => {
      log.connects += 1;
      return connection;
    },
  };
  return { source, log };
}

/** A focal subject with a name, a parent over PART_OF and an ECHE relationship. */
function world(note: string | null = null, parent: string = randomUUID()) {
  const focal = randomUUID();
  const tables: Tables = {
    subjects: [subjectRow(focal, note), subjectRow(parent)],
    identity: [
      claimRow(focal, 'NAME', { name_text: 'Synthetic Unit Focal' }),
      claimRow(parent, 'NAME', { name_text: 'Synthetic Unit Parent' }),
    ],
    relationships: [
      relationshipRow(focal, 'PART_OF', { target_subject_id: parent }),
      relationshipRow(focal, 'OPERATES_AT', { target_eche_row_key: 'T P1A UNIT01|300000061' }),
    ],
    reviews: [],
    attestations: [],
    organisations: ['T P1A UNIT01|300000061', 'T P1A OTHER01|300000062'],
  };
  return { focal, parent, tables };
}

function built(result: SubjectSnapshotReadResult) {
  if (result.outcome !== 'BUILT') throw new Error(`expected BUILT, got ${JSON.stringify(result)}`);
  return result;
}

async function refusalOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SubjectSnapshotReadRefusal) return error.code;
    throw error;
  }
  return 'SUCCEEDED';
}

const PROBE = 'SELECT transaction_timestamp() = statement_timestamp() AS no_open_block';
const BEGIN = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';
const isLoader = (sql: string) => /discovery_subject|organisations|subject_review/.test(sql);

describe('B2.5-P1a assembler: the transaction protocol', () => {
  it('probes, begins, checks the server state, loads, re-checks, and always rolls back', async () => {
    const { focal, tables } = world();
    const f = fake({ tables });
    built(await assembleSubjectSnapshotScope(f.source, focal));
    expect(f.log.connects).toBe(1);
    expect(f.log.releases).toEqual([undefined]);
    expect(f.log.sql[0]).toBe(PROBE);
    expect(f.log.sql[1]).toBe(BEGIN);
    expect(f.log.sql[2]).toMatch(/^SELECT current_setting\('transaction_isolation'\)/);
    expect(f.log.sql[3]).toMatch(/clock_timestamp/);
    expect(isLoader(f.log.sql[4]!)).toBe(true);
    expect(f.log.sql.at(-2)).toMatch(/^SELECT current_setting\('transaction_isolation'\)/);
    expect(f.log.sql.at(-1)).toBe('ROLLBACK');
    expect(f.log.sql.filter((s) => /^(BEGIN|COMMIT|ROLLBACK|SET|SAVEPOINT)/.test(s))).toEqual([
      BEGIN,
      'ROLLBACK',
    ]);
  });

  it('refuses a malformed focal id before connecting', async () => {
    const f = fake({ tables: world().tables });
    for (const bad of ['', 'not-a-uuid', randomUUID().toUpperCase(), 7 as unknown as string]) {
      expect(await refusalOf(() => assembleSubjectSnapshotScope(f.source, bad))).toBe(
        'FOCAL_SUBJECT_ID_MALFORMED',
      );
    }
    expect(f.log.connects).toBe(0);
  });

  it('returns SUBJECT_NOT_FOUND after a clean, rolled-back read', async () => {
    const f = fake({ tables: world().tables });
    const id = randomUUID();
    expect(await assembleSubjectSnapshotScope(f.source, id)).toEqual({
      outcome: 'SUBJECT_NOT_FOUND',
      focalSubjectId: id,
      read: SNAPSHOT_READ_FACTS,
    });
    expect(f.log.sql.at(-1)).toBe('ROLLBACK');
    expect(f.log.releases).toEqual([undefined]);
  });

  it.each([
    ['read committed', 'on', 'TRANSACTION_NOT_REPEATABLE_READ'],
    ['serializable', 'on', 'TRANSACTION_NOT_REPEATABLE_READ'],
    ['repeatable read', 'off', 'TRANSACTION_NOT_READ_ONLY'],
  ])(
    'refuses a server-reported %s / read_only=%s before the loader runs',
    async (iso, ro, code) => {
      const { focal, tables } = world();
      const f = fake({ tables, states: [{ ...GOOD_STATE, isolation: iso, read_only: ro }] });
      expect(await refusalOf(() => assembleSubjectSnapshotScope(f.source, focal))).toBe(code);
      expect(f.log.sql.some(isLoader)).toBe(false);
      expect(f.log.sql.at(-1)).toBe('ROLLBACK');
      expect(f.log.releases).toEqual([undefined]);
    },
  );

  it('refuses an absent server state (no row) rather than assuming one', async () => {
    const { focal, tables } = world();
    const f = fake({ tables, states: [null] });
    expect(await refusalOf(() => assembleSubjectSnapshotScope(f.source, focal))).toBe(
      'TRANSACTION_NOT_REPEATABLE_READ',
    );
  });

  it.each([
    ['the isolation', { isolation: 'read committed' }, 'TRANSACTION_NOT_REPEATABLE_READ'],
    ['the read-only state', { read_only: 'off' }, 'TRANSACTION_NOT_READ_ONLY'],
    ['the start instant', { started: '2026-10-17 12:00:09+00' }, 'TRANSACTION_SNAPSHOT_CHANGED'],
    ['the snapshot', { snapshot: '765:765:' }, 'TRANSACTION_SNAPSHOT_CHANGED'],
  ])('refuses when %s differs after the loader, returning nothing', async (_what, change, code) => {
    const { focal, tables } = world();
    const f = fake({ tables, states: [GOOD_STATE, { ...GOOD_STATE, ...change }] });
    expect(await refusalOf(() => assembleSubjectSnapshotScope(f.source, focal))).toBe(code);
    expect(f.log.sql.at(-1)).toBe('ROLLBACK');
    expect(f.log.releases).toEqual([undefined]);
  });

  it.each([
    ['an open transaction', [{ no_open_block: false }]],
    ['no probe answer', []],
    ['a non-boolean answer', [{ no_open_block: 't' }]],
  ])('refuses a connection reporting %s, never BEGINs on it, and discards it', async (_w, rows) => {
    const { focal, tables } = world();
    const f = fake({ tables, noOpenBlock: rows });
    expect(await refusalOf(() => assembleSubjectSnapshotScope(f.source, focal))).toBe(
      'CONNECTION_IN_OPEN_TRANSACTION',
    );
    expect(f.log.sql).toEqual([PROBE]);
    expect(f.log.releases).toEqual([true]);
  });

  it('rolls back and rethrows a loader failure; the connection is returned clean', async () => {
    const { focal, tables } = world();
    const f = fake({ tables, failOn: /FROM discovery_subject_reviews/ });
    await expect(assembleSubjectSnapshotScope(f.source, focal)).rejects.toThrow(
      'synthetic failure',
    );
    expect(f.log.sql.at(-1)).toBe('ROLLBACK');
    expect(f.log.releases).toEqual([undefined]);
  });

  it('discards the connection when the rollback after a failure fails too, rethrowing the first error', async () => {
    const { focal, tables } = world();
    const f = fake({ tables, failOn: /FROM discovery_subject_reviews/, failRollback: true });
    await expect(assembleSubjectSnapshotScope(f.source, focal)).rejects.toThrow(
      'synthetic failure',
    );
    expect(f.log.releases).toEqual([true]);
  });

  it('discards the connection when the final rollback fails, and returns nothing', async () => {
    const { focal, tables } = world();
    const f = fake({ tables, failRollback: true });
    await expect(assembleSubjectSnapshotScope(f.source, focal)).rejects.toThrow(
      'synthetic rollback failure',
    );
    expect(f.log.releases).toEqual([true]);
  });

  it('attempts a rollback when BEGIN itself fails', async () => {
    const { focal, tables } = world();
    const f = fake({ tables, failOn: /^BEGIN/ });
    await expect(assembleSubjectSnapshotScope(f.source, focal)).rejects.toThrow(
      'synthetic failure',
    );
    expect(f.log.sql.at(-1)).toBe('ROLLBACK');
    expect(f.log.releases).toEqual([undefined]);
  });

  it('R1: discards a connection whose probe throws, unended, and surfaces the original error', async () => {
    const { focal, tables } = world();
    // What a connection handed over inside an ABORTED transaction answers.
    const aborted = Object.assign(
      new Error('current transaction is aborted, commands ignored until end of transaction block'),
      { code: '25P02' },
    );
    for (const failWith of [aborted, new Error('synthetic probe failure')]) {
      const f = fake({ tables, failOn: /no_open_block/, failWith });
      let thrown: unknown;
      const result = await assembleSubjectSnapshotScope(f.source, focal).catch((e: unknown) => {
        thrown = e;
        return undefined;
      });
      expect(result).toBeUndefined();
      expect(thrown).toBe(failWith);
      // Neither BEGIN nor ROLLBACK on a connection whose state was never verified.
      expect(f.log.sql).toEqual([PROBE]);
      expect(f.log.connects).toBe(1);
      expect(f.log.releases).toEqual([true]);
    }
  });

  it.each([
    ['the probe throws', { failOn: /no_open_block/ }, [true], 'NOTHING'],
    [
      'the probe reports an open block',
      { noOpenBlock: [{ no_open_block: false }] },
      [true],
      'NOTHING',
    ],
    ['BEGIN throws', { failOn: /^BEGIN/ }, [undefined], 'NOTHING'],
    ['the loader throws', { failOn: /FROM discovery_subject_reviews/ }, [undefined], 'NOTHING'],
    [
      'the loader and its rollback throw',
      { failOn: /FROM discovery_subject_reviews/, failRollback: true },
      [true],
      'NOTHING',
    ],
    ['the final rollback throws', { failRollback: true }, [true], 'NOTHING'],
    ['nothing throws', {}, [undefined], 'BUILT'],
  ] as const)(
    'R1: releases or discards exactly once, with no partial result, when %s',
    async (_when, options, releases, outcome) => {
      const { focal, tables } = world();
      const f = fake({ tables, ...options });
      const result = await assembleSubjectSnapshotScope(f.source, focal).catch(() => 'NOTHING');
      expect(f.log.connects).toBe(1);
      expect(f.log.releases).toEqual(releases);
      expect(typeof result === 'string' ? result : result.outcome).toBe(outcome);
    },
  );

  it('returns REFUSED with no manifest when S0 cannot represent the records; the read had ended', async () => {
    const { focal, tables } = world('cand:synthetic-unit');
    const f = fake({ tables });
    const result = await assembleSubjectSnapshotScope(f.source, focal);
    expect(result).toEqual({
      outcome: 'REFUSED',
      code: 'CANONICAL_IDENTIFIER_INADMISSIBLE',
      detail: 'SUBJECT.registrationNote',
      read: SNAPSHOT_READ_FACTS,
    });
    expect(f.log.sql.at(-1)).toBe('ROLLBACK');
  });

  it('exposes exactly the declared refusal codes', () => {
    expect([...SNAPSHOT_READ_REFUSAL_CODES].sort()).toEqual(
      [
        'CONNECTION_IN_OPEN_TRANSACTION',
        'FOCAL_SUBJECT_ID_MALFORMED',
        'REVIEW_ATTESTATIONS_NOT_LOADED',
        'TRANSACTION_NOT_READ_ONLY',
        'TRANSACTION_NOT_REPEATABLE_READ',
        'TRANSACTION_SNAPSHOT_CHANGED',
      ].sort(),
    );
  });
});

describe('B2.5-P1a assembler: the conservative S0 mapping', () => {
  it('declares gaps for everything the loader does not enumerate, and REPRESENTED only for the rest', () => {
    expect(Object.keys(SCOPE_DECLARATIONS)).toEqual([...SCOPE_CATEGORIES]);
    expect(Object.keys(SCOPE_DECLARATION_BASIS)).toEqual([...SCOPE_CATEGORIES]);
    const represented = SCOPE_CATEGORIES.filter((c) => SCOPE_DECLARATIONS[c] === 'REPRESENTED');
    expect(represented).toEqual([
      'FOCAL_SUBJECT',
      'FOCAL_IDENTITY_CLAIMS',
      'OUTGOING_RELATIONSHIP_CLAIMS',
      'REFERENCED_RECORDS',
      'REVIEW_RECORDS',
      'REVIEW_ATTESTATION_REFERENCES',
    ]);
    for (const never of [
      'INCOMING_RELATIONSHIP_CLAIMS',
      'SHARED_IDENTIFIER_HOLDERS',
      'RECORD_SCOPED_FINDINGS',
      'INPUT_SCOPED_FINDINGS',
      'NEIGHBOUR_RECORD_FINDINGS',
      'PROTECTION_STATUS',
    ] as const) {
      expect(SCOPE_DECLARATIONS[never]).toBe('UNKNOWN');
    }
    expect(Object.isFrozen(SCOPE_DECLARATIONS)).toBe(true);
    expect(Object.isFrozen(SNAPSHOT_READ_FACTS)).toBe(true);
    expect(Object.isFrozen(SNAPSHOT_READ_FACTS.loaderLimitations)).toBe(true);
    expect(SNAPSHOT_READ_FACTS.durableSourceRevision).toBe('NONE');
  });

  it('maps a retrieved graph into the unmodified S0 input with no validator and no caller values', async () => {
    const { focal, parent, tables } = world();
    const result = built(await assembleSubjectSnapshotScope(fake({ tables }).source, focal));
    const input = result.input;
    expect(input.contract).toBe(SNAPSHOT_SCOPE_CONTRACT);
    expect(input.inputOrigin).toBe('CALLER_SUPPLIED_UNVERIFIED');
    expect(input.findings).toEqual([]);
    expect(input.validation).toEqual({
      ruleVersion: null,
      execution: 'NOT_RUN',
      asOf: NOW,
      echeRowKeyState: {
        queriedKeys: ['T P1A UNIT01|300000061'],
        presentKeys: ['T P1A UNIT01|300000061'],
      },
    });
    // P1c: the incoming claim query returned no row, under its sentinel limit.
    expect(input.scope.relationshipDirectionsExamined).toEqual(['INCOMING', 'OUTGOING']);
    // P1b: no focal identifier, so the holder predicate has no member - exhaustively.
    expect(input.scope.categories).toEqual({
      ...SCOPE_DECLARATIONS,
      SHARED_IDENTIFIER_HOLDERS: 'REPRESENTED',
      INCOMING_RELATIONSHIP_CLAIMS: 'REPRESENTED',
    });
    expect(input.scope.sharedIdentifierHolders).toEqual({
      enumeration: 'EXHAUSTIVE_AS_DECLARED',
      bound: MAX_SHARED_IDENTIFIER_HOLDERS + 1,
      holderSubjectIds: [],
    });
    expect(input.protectionCheck).toBe('NOT_CONSULTED');
    expect((input.records.subjects as { id: string }[]).map((s) => s.id).sort()).toEqual(
      [focal, parent].sort(),
    );
    expect(verifySnapshotScopeManifest(result.manifest).contentDigestConsistency).toBe(
      'CONSISTENT',
    );
    expect(result.read).toBe(SNAPSHOT_READ_FACTS);
  });

  it('declares the holder query own set, exhaustive only because the sentinel row is absent (P1b)', async () => {
    const { focal, tables } = world();
    const holder = randomUUID();
    tables.subjects.push(subjectRow(holder));
    for (const s of [focal, holder]) {
      tables.identity.push(
        claimRow(s, 'EXTERNAL_IDENTIFIER', {
          identifier_scheme: 'EU_PIC',
          identifier_value: '999000701',
        }),
      );
    }
    const m = built(await assembleSubjectSnapshotScope(fake({ tables }).source, focal)).manifest;
    expect(m.scope.sharedIdentifierHolders).toEqual({
      enumeration: 'EXHAUSTIVE_AS_DECLARED',
      bound: 21,
      holderSubjectIds: [holder],
    });
    expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('REPRESENTED');
    expect(m.omissions.map((o) => o.code)).not.toContain(
      'SHARED_IDENTIFIER_HOLDER_ENUMERATION_UNKNOWN',
    );
    expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
    expect(m.states.declaredScopeCoverage).toBe('GAPS_DECLARED');
  });

  it('keeps a relationship target beyond the holder cap out of the declared holders: TRUNCATED, not REFUSED (P1b)', async () => {
    // A PART_OF parent sharing the identifier is retrieved anyway, so the
    // retrieved claims show more holders than the holder query includes.
    // The parent's id sorts after every holder's, so the LIMIT cuts it from the holder query.
    const { focal, parent, tables } = world(null, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
    const pic = { identifier_scheme: 'EU_PIC', identifier_value: '999000702' };
    tables.identity.push(claimRow(focal, 'EXTERNAL_IDENTIFIER', pic));
    tables.identity.push(claimRow(parent, 'EXTERNAL_IDENTIFIER', pic));
    for (let i = 0; i < 21; i += 1) {
      const h = randomUUID();
      tables.subjects.push(subjectRow(h));
      tables.identity.push(claimRow(h, 'EXTERNAL_IDENTIFIER', pic));
    }
    const result = await assembleSubjectSnapshotScope(fake({ tables }).source, focal);
    const inSource = new Set(
      tables.identity
        .filter((c) => c.subject_id !== focal && c.identifier_value === '999000702')
        .map((c) => c.subject_id),
    );
    expect(inSource.size).toBe(22);
    const m = built(result).manifest;
    const holders = m.scope.sharedIdentifierHolders;
    expect(holders.enumeration).toBe('TRUNCATED');
    expect(holders.bound).toBe(21);
    expect(holders.holderSubjectIds).toHaveLength(20);
    expect(holders.holderSubjectIds).not.toContain(parent);
    expect(m.membership.entries.map((e) => e.recordId)).toContain(parent);
    expect(m.scope.categories.SHARED_IDENTIFIER_HOLDERS).toBe('INCOMPLETE');
    expect(m.omissions).toContainEqual({
      code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_TRUNCATED',
      ref: focal,
    });
  });

  it('turns attestations into S0 references only: no payload, signature, environment or nonce count', async () => {
    const { focal, tables } = world();
    const reviewId = randomUUID();
    const attestationId = randomUUID();
    tables.reviews.push({
      id: reviewId,
      target: `subject:${focal}`,
      reviewed_subject_id: focal,
      reviewed_identity_claim_id: null,
      reviewed_relationship_claim_id: null,
      review_outcome: 'CONFIRMED',
      supersedes_review_id: null,
      actor_key: 'owner-review-p1a-test-key',
      reviewed_at: OBSERVED,
      reason: null,
      created_at: OBSERVED,
    });
    const secretish = {
      signed_payload: 'U1lOVEhFVElDLVBBWUxPQUQ',
      signature: 'U1lOVEhFVElDLVNJR05BVFVSRQ',
      nonce: 'U1lOVEhFVElDLU5PTkNF',
    };
    tables.attestations.push({
      id: attestationId,
      review_id: reviewId,
      environment_id: ENVIRONMENT,
      protocol: 'nwf-pe.discovery-subject-review/1',
      action: 'APPEND_DISCOVERY_SUBJECT_REVIEW',
      key_id: 'p1a-test-key',
      key_fingerprint: 'f'.repeat(64),
      subject_id: focal,
      review_target_key: `subject:${focal}`,
      review_outcome: 'CONFIRMED',
      expected_head_review_id: null,
      subject_state_digest: 'a'.repeat(64),
      evidence_snapshot_digest: 'b'.repeat(64),
      target_record_digest: 'c'.repeat(64),
      rule_version: 'discovery-identity-rules-v1',
      issued_at: OBSERVED,
      expires_at: OBSERVED,
      payload_sha256: 'd'.repeat(64),
      recorded_at: OBSERVED,
      ...secretish,
    });
    const result = built(await assembleSubjectSnapshotScope(fake({ tables }).source, focal));
    expect(result.input.records.attestationReferences).toEqual([
      { id: attestationId, reviewId, keyId: 'p1a-test-key', payloadSha256: 'd'.repeat(64) },
    ]);
    const text = JSON.stringify(result);
    for (const value of [...Object.values(secretish), ENVIRONMENT, 'f'.repeat(64)]) {
      expect(text).not.toContain(value);
    }
    expect(result.manifest.reviews.attestationReferences).toEqual([
      {
        attestationId,
        reviewId,
        reviewSupplied: true,
        signatureVerification: 'NOT_PERFORMED',
        reviewerTrust: 'NONE_ESTABLISHED',
      },
    ]);
  });

  it('never commits the transaction snapshot or start instant', async () => {
    const { focal, tables } = world();
    const result = built(await assembleSubjectSnapshotScope(fake({ tables }).source, focal));
    const text = JSON.stringify(result);
    expect(text).not.toContain(GOOD_STATE.snapshot);
    expect(text).not.toContain(GOOD_STATE.started);
  });
});
