/**
 * TRACK B, B2.5-P1a - THE TRANSACTION-BOUND DISCOVERY-SUBJECT SNAPSHOT
 * ASSEMBLER.
 *
 * `assembleSubjectSnapshotScope` reads ONE focal Discovery Subject's bounded
 * neighbourhood through the EXISTING B2.2 loader (`loadSubjectGraph`, which is
 * SELECT-only and owns no transaction) and turns what it retrieved into the
 * EXISTING, unmodified S0 manifest input. Both are reused as they are; neither
 * is edited.
 *
 * WHAT IT ENFORCES, IN CODE. The caller injects connectivity, never a
 * transaction and never a claim about one:
 *   - exactly ONE `connect()`, and every read - the loader's included - runs
 *     on that one connection;
 *   - before BEGIN, the connection is proven to hold no open transaction block
 *     (an implicit transaction's start instant IS its statement's), so the
 *     transaction below is the assembler's own;
 *   - it begins REPEATABLE READ, READ ONLY itself, and then reads back the
 *     SERVER's effective isolation and read-only state - a downgraded or
 *     read-write transaction is refused before the loader runs;
 *   - after the loader, the same state, the transaction start instant and the
 *     transaction-local snapshot are read again and must be unchanged;
 *   - it always ends with ROLLBACK (nothing it does is ever committed); on any
 *     error it rolls back, discards a connection whose state it cannot vouch
 *     for, and returns nothing - no partial manifest exists.
 *
 * WHAT IT MAY CLAIM. Only that the records it RETRIEVED for one focal subject
 * were read under one PostgreSQL transaction snapshot, and that the S0
 * manifest content-binds them. Not that every relevant record was retrieved:
 * the loader follows outgoing relationships only, includes at most
 * MAX_SHARED_IDENTIFIER_HOLDERS shared-identifier holders, and the B2.1
 * validator is not run here. Every such gap is declared to S0 as INCOMPLETE
 * or UNKNOWN, never as REPRESENTED. The transaction snapshot is compared,
 * never exported: it is transaction-local, not a durable source revision.
 *
 * B2.5-P1b: the holder query now runs with one sentinel row beyond its
 * included cap and the loader REPORTS how it ended. Only that verified
 * outcome decides the holder declaration: EXHAUSTIVE (fewer rows than the
 * query's limit) is REPRESENTED under exactly the holder query's predicate
 * and this transaction's snapshot; TRUNCATED is INCOMPLETE; anything else
 * stays UNKNOWN. The declared holders are the query's own included set,
 * never the subjects that happen to share an identifier because they were
 * loaded for another reason, and the sentinel is never exported. S0 is told
 * the query's real LIMIT as its bound, so its own "reaching the bound is
 * never exhaustive" rule still holds over what is declared.
 *
 * B2.5-P1c: the loader also REPORTS the direct incoming relationship claims
 * (other subjects' claims targeting the focal subject), capped with one
 * sentinel row, in the same transaction. Only that verified outcome decides
 * the incoming declaration: EXHAUSTIVE is REPRESENTED, TRUNCATED is
 * INCOMPLETE, anything else stays UNKNOWN and adds no claim. S0 has no
 * incoming bound, so the cap is not committed by the manifest; the category
 * is. An included claim is the claim RECORD only. Its source subject is
 * identified by the claim and supplied only when the loader read it for
 * another reason - otherwise S0 records the omission and REFERENCED_RECORDS
 * is INCOMPLETE; and a claim the loader did not reach on its own carries no
 * review chain, so REVIEW_RECORDS is INCOMPLETE. Nothing about parentage,
 * independence or the source subjects' other evidence is claimed.
 *
 * B2.5-P1d: the loader now also reads, by exact id and in the same
 * transaction, the stored SUBJECT ROW of each distinct source subject an
 * included incoming claim names and the graph did not already hold - a
 * finite set fixed by the incoming report, never a new enumeration. Each row
 * read is supplied beside the loader's subjects and S0 derives its role from
 * the claims (an incoming relationship source, never the focal subject). A
 * source subject neither held nor read stays an explicit omission with
 * REFERENCED_RECORDS INCOMPLETE. A row read is the record ONLY: the subject's
 * own claims, relationships, reviews and attestations stay unread, so
 * REVIEW_RECORDS stays INCOMPLETE, and parentage, independence, protection
 * and identity stay exactly as unknown as before. Resolving every reference
 * of the included claims never makes a TRUNCATED incoming category whole.
 *
 * WHAT IT NEVER TOUCHES. No writer, no review signing or verification, no
 * trust set, no protected-cohort registry, no research, classifier or
 * identity-register path, no environment, no pool of its own. Nothing in
 * production calls it.
 */
import type pg from 'pg';

import {
  databaseNow,
  loadSubjectGraph,
  MAX_SHARED_IDENTIFIER_HOLDERS,
} from '../subjectRegistry/store.js';
import {
  PROTECTION_CHECK,
  SNAPSHOT_SCOPE_CONTRACT,
  UUID,
  type CategoryDeclaration,
  type ScopeCategory,
  type SnapshotScopeRefusalCode,
} from '../subjectSnapshot/contract.js';
import {
  buildSnapshotScopeManifest,
  type SnapshotScopeInput,
  type SnapshotScopeManifest,
} from '../subjectSnapshot/manifest.js';

/** The one connection an assembly owns, from `connect()` until it is released. */
export type SnapshotReadConnection = Pick<pg.PoolClient, 'query' | 'release'>;

/**
 * Caller-injected connectivity (a `pg.Pool` satisfies it). The assembler calls
 * `connect()` exactly once per assembly and releases that connection itself;
 * the caller owns the source and its credentials.
 */
export interface SnapshotReadConnectionSource {
  connect(): Promise<SnapshotReadConnection>;
}

export const SNAPSHOT_READ_REFUSAL_CODES = [
  'FOCAL_SUBJECT_ID_MALFORMED',
  'CONNECTION_IN_OPEN_TRANSACTION',
  'TRANSACTION_NOT_REPEATABLE_READ',
  'TRANSACTION_NOT_READ_ONLY',
  'TRANSACTION_SNAPSHOT_CHANGED',
  'REVIEW_ATTESTATIONS_NOT_LOADED',
] as const;
export type SnapshotReadRefusalCode = (typeof SNAPSHOT_READ_REFUSAL_CODES)[number];

/** A refused read. Thrown, never returned beside a manifest. */
export class SubjectSnapshotReadRefusal extends Error {
  constructor(
    readonly code: SnapshotReadRefusalCode,
    readonly detail: string,
  ) {
    super(`subject snapshot read refused: ${code} (${detail})`);
    this.name = 'SubjectSnapshotReadRefusal';
  }
}

/**
 * The declaration made to S0 for each of its scope categories, from what the
 * B2.2 loader's queries actually enumerate. REPRESENTED only where a query
 * returns EVERY matching row in the snapshot (a bound is refused by the
 * loader, never truncated); everything else is a declared gap.
 * SHARED_IDENTIFIER_HOLDERS and INCOMING_RELATIONSHIP_CLAIMS here are the
 * fallbacks only: each read replaces them with the declaration of the
 * loader's verified enumeration (P1b, P1c), and lowers REFERENCED_RECORDS and
 * REVIEW_RECORDS to INCOMPLETE when an included incoming claim brings a
 * source subject or review chain the loader did not read (P1c). A source
 * subject whose row the loader read by exact id (P1d) satisfies the claim's
 * reference, never its own review chain: REVIEW_RECORDS stays INCOMPLETE.
 */
export const SCOPE_DECLARATIONS: { readonly [K in ScopeCategory]: CategoryDeclaration } =
  Object.freeze({
    FOCAL_SUBJECT: 'REPRESENTED',
    FOCAL_IDENTITY_CLAIMS: 'REPRESENTED',
    OUTGOING_RELATIONSHIP_CLAIMS: 'REPRESENTED',
    INCOMING_RELATIONSHIP_CLAIMS: 'UNKNOWN',
    REFERENCED_RECORDS: 'REPRESENTED',
    SHARED_IDENTIFIER_HOLDERS: 'UNKNOWN',
    RECORD_SCOPED_FINDINGS: 'UNKNOWN',
    INPUT_SCOPED_FINDINGS: 'UNKNOWN',
    NEIGHBOUR_RECORD_FINDINGS: 'UNKNOWN',
    REVIEW_RECORDS: 'REPRESENTED',
    REVIEW_ATTESTATION_REFERENCES: 'REPRESENTED',
    VALIDATION_INPUTS: 'INCOMPLETE',
    SOURCE_GLOBALS: 'INCOMPLETE',
    PROTECTION_STATUS: 'UNKNOWN',
  });

/** Why each declaration is what it is. Reviewable statements, never computed. */
export const SCOPE_DECLARATION_BASIS: { readonly [K in ScopeCategory]: string } = Object.freeze({
  FOCAL_SUBJECT: 'LOADER_READS_THE_SUBJECT_ROW_BY_ID',
  FOCAL_IDENTITY_CLAIMS: 'LOADER_READS_EVERY_CLAIM_OF_EVERY_LOADED_SUBJECT_BOUND_REFUSED',
  OUTGOING_RELATIONSHIP_CLAIMS: 'LOADER_READS_EVERY_FOCAL_RELATIONSHIP_CLAIM_BOUND_REFUSED',
  INCOMING_RELATIONSHIP_CLAIMS: 'LOADER_INCOMING_CLAIM_QUERY_SENTINEL_OUTCOME_DECIDES_EACH_READ',
  REFERENCED_RECORDS:
    'LOADER_READS_EVERY_TARGET_AND_REVIEW_CHAIN_IT_REFERENCES_AND_INCOMING_SOURCE_SUBJECT_ROWS_BY_EXACT_ID',
  SHARED_IDENTIFIER_HOLDERS: 'LOADER_HOLDER_QUERY_SENTINEL_OUTCOME_DECIDES_EACH_READ',
  RECORD_SCOPED_FINDINGS: 'VALIDATOR_NOT_RUN',
  INPUT_SCOPED_FINDINGS: 'VALIDATOR_NOT_RUN',
  NEIGHBOUR_RECORD_FINDINGS: 'VALIDATOR_NOT_RUN',
  REVIEW_RECORDS:
    'LOADER_READS_EVERY_REVIEW_OF_EVERY_LOADED_RECORD_BOUND_REFUSED_INCOMING_CLAIM_AND_SOURCE_SUBJECT_REVIEWS_UNREAD',
  REVIEW_ATTESTATION_REFERENCES: 'LOADER_READS_EVERY_ATTESTATION_OF_EVERY_LOADED_REVIEW',
  VALIDATION_INPUTS: 'NO_VALIDATOR_RULE_VERSION_VALIDATOR_NOT_RUN',
  SOURCE_GLOBALS: 'REVIEW_ENVIRONMENT_AND_NONCE_USE_COUNTS_NOT_REPRESENTABLE',
  PROTECTION_STATUS: 'PROTECTED_REGISTRY_NOT_CONSULTED',
});

/**
 * What a BUILT, REFUSED or SUBJECT_NOT_FOUND result can say about the read.
 * Fixed: every path that could make one of these untrue throws instead. They
 * are NOT committed by the manifest digest - they describe this in-memory
 * result, and nothing stops anyone attaching them to another manifest.
 */
export const SNAPSHOT_READ_FACTS = Object.freeze({
  connection: 'ONE_CALLER_INJECTED_CONNECTION_OWNED_FOR_THE_ASSEMBLY',
  transaction: 'REPEATABLE_READ_READ_ONLY_BEGUN_HERE_SERVER_STATE_CHECKED_AT_START_AND_END',
  transactionEnd: 'ROLLED_BACK',
  claim: 'RETRIEVED_RECORDS_READ_UNDER_ONE_TRANSACTION_SNAPSHOT_NOT_EVERY_RELEVANT_RECORD',
  transactionSnapshot: 'TRANSACTION_LOCAL_COMPARED_NOT_EXPORTED_NOT_A_SOURCE_REVISION',
  durableSourceRevision: 'NONE',
  validationAsOf: 'DATABASE_CLOCK_READ_INSIDE_THE_TRANSACTION_SESSION_DEPENDENT',
  manifestBinding: 'THESE_FACTS_ARE_NOT_COMMITTED_BY_THE_MANIFEST_DIGEST',
  loaderLimitations: Object.freeze([
    'ATTESTATION_PAYLOADS_SIGNATURES_ENVIRONMENT_AND_NONCE_COUNTS_NOT_REPRESENTED',
    'INCOMING_RELATIONSHIP_CLAIMS_CAPPED_OVERFLOW_DETECTED_NEVER_ENUMERATED',
    'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_NOT_READ',
    'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
    'NEIGHBOUR_RELATIONSHIPS_LIMITED_TO_THE_PART_OF_CHAIN',
    'PROTECTED_REGISTRY_NOT_CONSULTED',
    'RECORD_CREATION_INSTANTS_NOT_REPRESENTED',
    'SHARED_IDENTIFIER_HOLDERS_CAPPED_OVERFLOW_DETECTED_NEVER_ENUMERATED',
    'VALIDATOR_NOT_RUN',
  ] as const),
} as const);

export type SubjectSnapshotReadResult =
  | {
      readonly outcome: 'BUILT';
      readonly manifest: SnapshotScopeManifest;
      readonly canonical: string;
      /** The exact S0 input the manifest was built from, for reproduction. */
      readonly input: SnapshotScopeInput;
      readonly read: typeof SNAPSHOT_READ_FACTS;
      /**
       * P1d: which source subjects of the included incoming claims the loader
       * requested by exact id, and which it could not read - absent from the
       * snapshot, or in a result it refused (UNKNOWN). NOT committed by the
       * manifest digest: the rows read are in `input`, the gaps are omissions.
       */
      readonly incomingClaimSourceSubjects: {
        readonly outcome: SourceSubjectRead['outcome'];
        readonly requestedSubjectIds: readonly string[];
        readonly unreadSubjectIds: readonly string[];
      };
    }
  | {
      /** S0 refused the retrieved records. The transaction had already ended; no manifest exists. */
      readonly outcome: 'REFUSED';
      readonly code: SnapshotScopeRefusalCode;
      readonly detail: string;
      readonly read: typeof SNAPSHOT_READ_FACTS;
    }
  | {
      readonly outcome: 'SUBJECT_NOT_FOUND';
      readonly focalSubjectId: string;
      readonly read: typeof SNAPSHOT_READ_FACTS;
    };

type SubjectGraph = NonNullable<Awaited<ReturnType<typeof loadSubjectGraph>>>;
type HolderScope = SnapshotScopeInput['scope']['sharedIdentifierHolders'];
type HolderEnumeration = NonNullable<SubjectGraph['sharedIdentifierHolderEnumeration']>;
type IncomingEnumeration = NonNullable<SubjectGraph['incomingRelationshipClaimEnumeration']>;
type SourceSubjectRead = NonNullable<SubjectGraph['incomingClaimSourceSubjectRead']>;
type Directions = SnapshotScopeInput['scope']['relationshipDirectionsExamined'];

/**
 * P1b: each verified loader outcome, as S0 states it. Only EXHAUSTIVE may be
 * REPRESENTED, and S0 still refuses that unless every holder it can observe
 * in the supplied claims is in the enumerated set and the set stays below
 * the declared bound.
 */
const HOLDER_SCOPE_OF: {
  readonly [K in HolderEnumeration['outcome']]: {
    readonly enumeration: HolderScope['enumeration'];
    readonly declaration: CategoryDeclaration;
  };
} = Object.freeze({
  EXHAUSTIVE: { enumeration: 'EXHAUSTIVE_AS_DECLARED', declaration: 'REPRESENTED' },
  TRUNCATED: { enumeration: 'TRUNCATED', declaration: 'INCOMPLETE' },
  UNKNOWN: { enumeration: 'UNKNOWN', declaration: 'UNKNOWN' },
});

/**
 * P1c: each verified incoming-query outcome, as S0 can state it - a category
 * declaration, plus the directions examined. Only EXHAUSTIVE may be
 * REPRESENTED; UNKNOWN examined nothing S0 may rely on.
 */
const INCOMING_SCOPE_OF: {
  readonly [K in IncomingEnumeration['outcome']]: {
    readonly declaration: CategoryDeclaration;
    readonly directions: Directions;
  };
} = Object.freeze({
  EXHAUSTIVE: { declaration: 'REPRESENTED', directions: ['INCOMING', 'OUTGOING'] },
  TRUNCATED: { declaration: 'INCOMPLETE', directions: ['INCOMING', 'OUTGOING'] },
  UNKNOWN: { declaration: 'UNKNOWN', directions: ['OUTGOING'] },
});

const NO_OPEN_TRANSACTION_BLOCK =
  'SELECT transaction_timestamp() = statement_timestamp() AS no_open_block';
const BEGIN_READ_SNAPSHOT = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';
const TRANSACTION_STATE = `SELECT current_setting('transaction_isolation') AS isolation,
       current_setting('transaction_read_only') AS read_only,
       pg_current_snapshot()::text AS snapshot,
       transaction_timestamp()::text AS started`;
const END_READ_SNAPSHOT = 'ROLLBACK';

interface TransactionState {
  isolation: string;
  read_only: string;
  snapshot: string;
  started: string;
}

function refuse(code: SnapshotReadRefusalCode, detail: string): never {
  throw new SubjectSnapshotReadRefusal(code, detail);
}

/** The SERVER's effective transaction state, refused unless REPEATABLE READ and READ ONLY. */
async function readSnapshotState(connection: SnapshotReadConnection): Promise<TransactionState> {
  const { rows } = await connection.query<TransactionState>(TRANSACTION_STATE);
  const state = rows[0];
  if (state?.isolation !== 'repeatable read') {
    refuse('TRANSACTION_NOT_REPEATABLE_READ', `server reports ${String(state?.isolation)}`);
  }
  if (state.read_only !== 'on') {
    refuse('TRANSACTION_NOT_READ_ONLY', `server reports transaction_read_only=${state.read_only}`);
  }
  return state;
}

/** Ends an open transaction after an error. False when the connection cannot be vouched for. */
async function endAfterError(connection: SnapshotReadConnection): Promise<boolean> {
  try {
    await connection.query(END_READ_SNAPSHOT);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the graph of `focalSubjectId` under one REPEATABLE READ, READ ONLY
 * transaction on one connection from `source` (see the file header), and
 * returns nothing on any failure: the error is rethrown after the transaction
 * has been rolled back and the connection released or discarded.
 */
async function readGraphInOneSnapshot(
  source: SnapshotReadConnectionSource,
  focalSubjectId: string,
): Promise<SubjectGraph | null> {
  const connection = await source.connect();
  let phase: 'PROBE' | 'OPEN' | 'ENDING' = 'PROBE';
  let graph: SubjectGraph | null;
  try {
    const probe = await connection.query<{ no_open_block: boolean }>(NO_OPEN_TRANSACTION_BLOCK);
    if (probe.rows[0]?.no_open_block !== true) {
      // Someone else's transaction: never ended here, never handed back either.
      refuse(
        'CONNECTION_IN_OPEN_TRANSACTION',
        'the connection was handed over inside a transaction',
      );
    }
    phase = 'OPEN';
    await connection.query(BEGIN_READ_SNAPSHOT);
    const start = await readSnapshotState(connection);
    graph = await loadSubjectGraph(connection, focalSubjectId, {
      asOf: await databaseNow(connection),
      sharedIdentifierHolders: 'REPORT',
      incomingRelationships: 'REPORT',
      incomingClaimSourceSubjects: 'READ',
    });
    const end = await readSnapshotState(connection);
    if (end.started !== start.started || end.snapshot !== start.snapshot) {
      refuse(
        'TRANSACTION_SNAPSHOT_CHANGED',
        'the transaction or its snapshot changed during the read',
      );
    }
    phase = 'ENDING';
    await connection.query(END_READ_SNAPSHOT);
  } catch (error) {
    // Only a transaction this assembly began is ended here. A refused or failed
    // probe, or a failed final ROLLBACK, leaves the connection's state
    // unverified, so it is discarded unended.
    let discard = true;
    if (phase === 'OPEN') discard = !(await endAfterError(connection));
    connection.release(discard ? true : undefined);
    throw error;
  }
  connection.release();
  return graph;
}

/**
 * The S0 input for exactly what the loader returned. Records pass through
 * unchanged, so S0's exact-key checks refuse any loader record it cannot
 * represent; attestations become S0 REFERENCES (id, review, key, payload
 * digest) and nothing more; the ECHE-row-key state is the loader's own query
 * set and answer, never a caller's; the holder scope is the loader's own
 * verified holder-query outcome (P1b), never a caller's; and the incoming
 * claims and their declaration are the loader's own verified incoming-query
 * outcome (P1c), never a caller's; and the only subjects added are the
 * source-subject rows the loader read for those claims (P1d).
 */
function snapshotScopeInputOf(graph: SubjectGraph): SnapshotScopeInput {
  const { input, focalSubjectId: focal } = graph;
  const attestations = graph.attestations;
  if (attestations === undefined) {
    refuse('REVIEW_ATTESTATIONS_NOT_LOADED', 'the loader returned no attestation set');
  }
  // The holder query's OWN included set and outcome, as the loader verified
  // them - never reconstructed from the claims, which also show subjects
  // loaded for other reasons. No report at all is UNKNOWN, with no holders.
  const reported = graph.sharedIdentifierHolderEnumeration;
  const holderScope = HOLDER_SCOPE_OF[reported?.outcome ?? 'UNKNOWN'];
  const holderSubjectIds = [...(reported?.holderSubjectIds ?? [])].sort();
  const holderBound = reported?.queryLimit ?? MAX_SHARED_IDENTIFIER_HOLDERS;
  // The incoming query's OWN included claims and outcome (P1c). No report at
  // all is UNKNOWN; UNKNOWN adds no claim. A claim the loader already holds
  // (the same stored row, reached over the PART_OF chain) is supplied once;
  // the same id with different content is kept twice, for S0 to refuse.
  const incoming = graph.incomingRelationshipClaimEnumeration;
  const incomingScope = INCOMING_SCOPE_OF[incoming?.outcome ?? 'UNKNOWN'];
  const incomingClaims =
    incomingScope.declaration === 'UNKNOWN' ? [] : (incoming?.relationshipClaims ?? []);
  const loadedClaims = new Map(input.relationshipClaims.map((r) => [r.id, JSON.stringify(r)]));
  const addedClaims = incomingClaims.filter((r) => loadedClaims.get(r.id) !== JSON.stringify(r));
  const loadedSubjects = new Set(input.subjects.map((s) => s.id));
  // P1d: the source-subject ROWS the loader read by exact id for the added
  // claims - never a subject it already held, never one no added claim names.
  // A source subject neither held nor read is identified, never retrieved.
  const addedSources = new Set(addedClaims.map((r) => r.subjectId));
  const sourceSubjectsRead =
    incomingScope.declaration === 'UNKNOWN'
      ? []
      : (graph.incomingClaimSourceSubjectRead?.subjects ?? []).filter(
          (s) => addedSources.has(s.id) && !loadedSubjects.has(s.id),
        );
  const suppliedSubjects = new Set([...loadedSubjects, ...sourceSubjectsRead.map((s) => s.id)]);
  const sourceSubjectUnread = addedClaims.some((r) => !suppliedSubjects.has(r.subjectId));
  // A claim the loader did not reach on its own came with no review chain, and
  // a source-subject row read by id came with none of its own.
  const reviewChainUnread =
    addedClaims.some((r) => !loadedClaims.has(r.id)) || sourceSubjectsRead.length > 0;
  // Exactly the keys the loader asked `organisations` about: every loaded
  // relationship's ECHE target (it is passed no extra keys here).
  const queriedKeys = [
    ...new Set(
      input.relationshipClaims
        .map((r) => r.targetEcheRowKey)
        .filter((k): k is string => k !== null),
    ),
  ].sort();
  return {
    contract: SNAPSHOT_SCOPE_CONTRACT,
    focalSubjectId: focal,
    // S0 has no database origin and verifies none; the read facts stay outside it.
    inputOrigin: 'CALLER_SUPPLIED_UNVERIFIED',
    records: {
      subjects: [...input.subjects, ...sourceSubjectsRead],
      identityClaims: input.identityClaims,
      relationshipClaims: [...input.relationshipClaims, ...addedClaims],
      reviews: input.reviews,
      attestationReferences: attestations.records.map((a) => ({
        id: a.id,
        reviewId: a.reviewId,
        keyId: a.keyId,
        payloadSha256: a.payloadSha256,
      })),
    },
    findings: [],
    validation: {
      ruleVersion: null,
      execution: 'NOT_RUN',
      asOf: input.asOf,
      echeRowKeyState: { queriedKeys, presentKeys: [...input.knownEcheRowKeys] },
    },
    scope: {
      relationshipDirectionsExamined: [...incomingScope.directions],
      categories: {
        ...SCOPE_DECLARATIONS,
        SHARED_IDENTIFIER_HOLDERS: holderScope.declaration,
        INCOMING_RELATIONSHIP_CLAIMS: incomingScope.declaration,
        ...(sourceSubjectUnread ? { REFERENCED_RECORDS: 'INCOMPLETE' as const } : {}),
        ...(reviewChainUnread ? { REVIEW_RECORDS: 'INCOMPLETE' as const } : {}),
      },
      sharedIdentifierHolders: {
        enumeration: holderScope.enumeration,
        bound: holderBound,
        holderSubjectIds,
      },
    },
    protectionCheck: PROTECTION_CHECK,
  };
}

/**
 * Assembles the S0 manifest of `focalSubjectId` from one read-only,
 * repeatable-read transaction on one connection from `source`. Throws
 * `SubjectSnapshotReadRefusal` (or the loader's own error) and returns nothing
 * when the read cannot be trusted; returns REFUSED, with no manifest, when S0
 * cannot represent what was retrieved.
 */
export async function assembleSubjectSnapshotScope(
  source: SnapshotReadConnectionSource,
  focalSubjectId: string,
): Promise<SubjectSnapshotReadResult> {
  if (typeof focalSubjectId !== 'string' || !UUID.test(focalSubjectId)) {
    refuse('FOCAL_SUBJECT_ID_MALFORMED', 'the focal subject id must be a lower-case UUID');
  }
  const graph = await readGraphInOneSnapshot(source, focalSubjectId);
  if (graph === null) {
    return { outcome: 'SUBJECT_NOT_FOUND', focalSubjectId, read: SNAPSHOT_READ_FACTS };
  }
  const input = snapshotScopeInputOf(graph);
  const built = buildSnapshotScopeManifest(input);
  if (built.outcome === 'REFUSED') {
    return {
      outcome: 'REFUSED',
      code: built.code,
      detail: built.detail,
      read: SNAPSHOT_READ_FACTS,
    };
  }
  const sourceRead = graph.incomingClaimSourceSubjectRead;
  return {
    outcome: 'BUILT',
    manifest: built.manifest,
    canonical: built.canonical,
    input,
    read: SNAPSHOT_READ_FACTS,
    incomingClaimSourceSubjects: {
      outcome: sourceRead?.outcome ?? 'UNKNOWN',
      requestedSubjectIds: [...(sourceRead?.requestedSubjectIds ?? [])],
      unreadSubjectIds: [...(sourceRead?.unreadSubjectIds ?? [])],
    },
  };
}
