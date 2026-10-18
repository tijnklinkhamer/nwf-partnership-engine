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
 * B2.5-P1e: the loader now also reads, in the same transaction, every stored
 * review whose target key is an included incoming claim it did not reach on
 * its own, and a reference to each of their attestations - by the exact
 * target keys the incoming report fixes, through the loader's own review
 * statement, which refuses rather than truncates beyond its bound. Each read
 * review is supplied as stored, superseded ones included, and S0 states its
 * chain; nothing more. A stored review is not a verified signature, a
 * trusted reviewer, the latest review beyond this snapshot or an admission
 * that the claim is true: S0's latestReview stays NOT_PROVEN, every chain's
 * source tail UNKNOWN, every attestation reference unverified and untrusted.
 * Reading every review of the included claims satisfies those claims' review
 * obligation only. REVIEW_RECORDS stays INCOMPLETE whenever an added claim's
 * source subject is not one the graph holds - its row read by id (P1d),
 * absent or unknown, its own reviews are unread - and whenever the review
 * read is UNKNOWN. It is REPRESENTED again only when every added claim's
 * reviews were read AND its source subject is a subject the graph holds, so
 * every review of every supplied record and source was read: the loader's
 * own standard.
 *
 * B2.5-V1: only when a caller asks for `validation: 'RUN'`, the existing,
 * unmodified B2.1 validator runs over EXACTLY the records supplied to S0, the
 * ECHE keys the loader found present and one `asOf`. Both reads send exactly
 * the same statements; the default one returns the same result as before,
 * with no findings and the validator not run. A validator finding is
 * PUBLISHED to S0 only where its truth depends on nothing the read left
 * partial:
 *   - INPUT findings (as-of, ECHE keys), always: their inputs are exact;
 *   - FOCAL_RECORD findings, always, with RECORD_SCOPED_FINDINGS REPRESENTED
 *     only when the focal subject, its claims, its outgoing claims and the
 *     shared-identifier holders (EXHAUSTIVE) are all REPRESENTED - otherwise
 *     the weakest of those - so an absent focal finding is never a proof of
 *     validity over a truncated holder set;
 *   - NEIGHBOUR_RECORD and UNSUPPLIED_RECORD findings, NEVER: a source
 *     subject read as a bare row has no name claim, an unread one is an
 *     unknown reference, a holder's own relationships are never loaded, so
 *     these diagnose the partial graph, not the data. They are withheld from
 *     the manifest, returned beside it as untrusted diagnostics, and
 *     NEIGHBOUR_RECORD_FINDINGS is always INCOMPLETE.
 * THE AS-OF (V1-R1). REPEATABLE READ takes its snapshot at the transaction's
 * first statement - the state check after BEGIN - not at BEGIN, so
 * `transaction_timestamp()` can precede a commit the snapshot shows, and a
 * record stamped by the writer's clock just before that commit would look
 * after it without being future-dated. The as-of is therefore the P1a read's
 * own: ONE `clock_timestamp()` reading (`databaseNow`), on the same
 * connection, taken after that first statement and before the loader's
 * first. Every commit the snapshot shows precedes it, and a commit after the
 * snapshot is invisible whatever its stamp; so, on a server clock that does
 * not step backwards, a visible record dated after it is genuinely
 * future-dated. That one string is the loader's `asOf`, S0's
 * VALIDATION_AS_OF and the validator's `asOf`. It is a validation input the
 * manifest content-binds - not a durable source revision and not a freshness
 * guarantee. Nothing here derives structural validity, a reviewed identity or
 * any authority from a finding or its absence; S0's executionVerification
 * stays NOT_VERIFIED.
 *
 * B2.5-M1: only when a caller asks for `acquisitionCompanion: 'BUILD'`, the
 * BUILT result also carries the provisional, B-local acquisition companion:
 * a records-only digest of the manifest's stored evidence records
 * (independent of the as-of, the ECHE key state, the findings and the read)
 * and, under one acquisition digest, how
 * each bounded read ended - taken from the loader's own reports and this
 * read's validation report, never from a caller - checked against the
 * manifest it references. Both reads send exactly the same statements; the
 * default and validated results are unchanged. The companion is
 * assembler-reported and unsigned: it proves no query ran, no source is
 * complete or current, and it is not part of the B2.4 -> H1 handoff.
 *
 * WHAT IT NEVER TOUCHES. No writer, no review signing or verification, no
 * trust set, no protected-cohort registry, no research, classifier or
 * identity-register path, no environment, no pool of its own. Nothing in
 * production calls it.
 */
import type pg from 'pg';

import { validateIdentityGraph, type IdentityFinding } from '../identity/validate.js';
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
import {
  buildAcquisitionCompanion,
  type AcquisitionCompanion,
  type AcquisitionObservations,
} from '../subjectReadProvenance/companion.js';

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
 * reference, never its own review chain: REVIEW_RECORDS stays INCOMPLETE. The
 * reviews of an included claim, once every one is read (P1e), satisfy that
 * claim's review chain and nothing else.
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
    'LOADER_READS_EVERY_REVIEW_OF_EVERY_LOADED_RECORD_AND_INCLUDED_INCOMING_CLAIM_BOUND_REFUSED_SOURCE_SUBJECT_REVIEWS_UNREAD',
  REVIEW_ATTESTATION_REFERENCES:
    'LOADER_READS_EVERY_ATTESTATION_OF_EVERY_LOADED_REVIEW_AND_INCLUDED_INCOMING_CLAIM_REVIEW',
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
    'INCOMING_RELATIONSHIP_CLAIM_REVIEWS_STORED_RECORDS_ONLY_NOT_VERIFIED_NOT_TRUSTED_NOT_PROVEN_LATEST',
    'INCOMING_RELATIONSHIP_SOURCE_SUBJECT_ROWS_ONLY_THEIR_CLAIMS_RELATIONSHIPS_REVIEWS_NOT_READ',
    'NEIGHBOUR_RELATIONSHIPS_LIMITED_TO_THE_PART_OF_CHAIN',
    'PROTECTED_REGISTRY_NOT_CONSULTED',
    'RECORD_CREATION_INSTANTS_NOT_REPRESENTED',
    'SHARED_IDENTIFIER_HOLDERS_CAPPED_OVERFLOW_DETECTED_NEVER_ENUMERATED',
    'VALIDATOR_NOT_RUN',
  ] as const),
} as const);

/** V1: the one B2.1 rule version a validated read may bind. A different validator does not compile. */
const ACCEPTED_RULE_VERSION = 'discovery-identity-rules-v1';

const PUBLISHED_PARTITIONS = Object.freeze(['INPUT', 'FOCAL_RECORD'] as const);

/**
 * V1: what a VALIDATED read can say, in place of SNAPSHOT_READ_FACTS. Fixed,
 * and like those NOT committed by the manifest digest.
 */
const VALIDATED_READ_FACTS = Object.freeze({
  ...SNAPSHOT_READ_FACTS,
  validationAsOf:
    'ONE_DATABASE_CLOCK_READING_ON_THE_READ_CONNECTION_AFTER_ITS_SNAPSHOT_EXISTED_THE_LOADERS_OWN',
  validationAsOfMeaning:
    'VALIDATION_INPUT_CONTENT_BOUND_NOT_A_DURABLE_SOURCE_REVISION_NOT_A_FRESHNESS_GUARANTEE',
  loaderLimitations: Object.freeze(
    SNAPSHOT_READ_FACTS.loaderLimitations.filter((l) => l !== 'VALIDATOR_NOT_RUN'),
  ),
  validation: Object.freeze({
    validator: 'B2_1_VALIDATE_IDENTITY_GRAPH_UNMODIFIED',
    ruleVersion: ACCEPTED_RULE_VERSION,
    inputs:
      'EXACTLY_THE_RECORDS_SUPPLIED_TO_S0_THE_PRESENT_ECHE_KEYS_AND_THE_ONE_POST_SNAPSHOT_AS_OF',
    execution: 'RAN_HERE_STATED_TO_S0_AS_CALLER_ASSERTED_RAN_S0_DOES_NOT_VERIFY_IT',
    publishedPartitions: PUBLISHED_PARTITIONS,
    inputFindings: 'PUBLISHED_REPRESENTED_THEIR_INPUTS_ARE_EXACT',
    focalFindings:
      'PUBLISHED_REPRESENTED_ONLY_WHEN_FOCAL_SUBJECT_CLAIMS_OUTGOING_CLAIMS_AND_SHARED_IDENTIFIER_HOLDERS_ARE_ALL_REPRESENTED',
    neighbourFindings:
      'WITHHELD_FROM_THE_MANIFEST_PARTIAL_GRAPH_DIAGNOSTICS_NOT_FINDINGS_COVERAGE_ALWAYS_INCOMPLETE',
    unsuppliedRecordFindings: 'WITHHELD_FROM_THE_MANIFEST_UNTRUSTED_DIAGNOSTICS_NOT_FINDINGS',
    asOfOrder:
      'SNAPSHOT_TAKEN_BY_THE_FIRST_STATEMENT_AFTER_BEGIN_CLOCK_READ_ONCE_AFTER_IT_EVERY_VISIBLE_COMMIT_PRECEDES_IT',
    absence: 'NO_PUBLISHED_FINDING_IS_NOT_PROOF_THAT_ANY_SUBJECT_IS_VALID',
    structuralValidity: 'NOT_DERIVED_NOT_STATED',
    authority: 'NONE_NO_IDENTITY_REVIEW_TRUST_PROTECTION_OR_OPERATIONAL_PROMOTION',
    governance: 'B_LOCAL_PROVISIONAL_OWNER_DECISION_NOT_CROSS_TRACK_RATIFIED',
  }),
} as const);

/** V1: the opt-in. NOT_RUN (the default) is the P1a-P1e read, statement for statement. */
export interface SnapshotReadOptions {
  readonly validation?: 'NOT_RUN' | 'RUN';
  /** M1: BUILD attaches the acquisition companion; anything else (the default) attaches nothing. */
  readonly acquisitionCompanion?: 'OMIT' | 'BUILD';
}

type FindingPartition = 'INPUT' | 'FOCAL_RECORD' | 'NEIGHBOUR_RECORD' | 'UNSUPPLIED_RECORD';

/** V1: a validator finding kept OUT of the manifest, and why. Never a finding of record. */
export interface WithheldDiagnostic {
  readonly finding: IdentityFinding;
  readonly partition: FindingPartition;
  readonly reason: 'NEIGHBOUR_RECORD_PARTIAL_GRAPH' | 'UNSUPPLIED_RECORD';
}

/** V1: the validated read, beside the manifest. NOT committed by the manifest digest. */
export interface SnapshotValidationReport {
  readonly ruleVersion: typeof ACCEPTED_RULE_VERSION;
  /**
   * The one database clock reading taken after the snapshot existed, as the
   * validator received it and the manifest binds it. A validation input, not
   * a source revision and not a freshness guarantee.
   */
  readonly asOf: string;
  readonly publishedFindingCount: { readonly input: number; readonly focalRecord: number };
  readonly focalCoverage: CategoryDeclaration;
  /** The focal-rule dependencies that are not REPRESENTED, and a loader reference gap, if any. */
  readonly focalCoverageGaps: readonly string[];
  readonly withheld: {
    readonly status: 'UNTRUSTED_DIAGNOSTICS_NOT_FINDINGS_NOT_IN_THE_MANIFEST';
    readonly diagnostics: readonly WithheldDiagnostic[];
  };
}

export type SubjectSnapshotReadResult =
  | {
      readonly outcome: 'BUILT';
      readonly manifest: SnapshotScopeManifest;
      readonly canonical: string;
      /** The exact S0 input the manifest was built from, for reproduction. */
      readonly input: SnapshotScopeInput;
      readonly read: typeof SNAPSHOT_READ_FACTS | typeof VALIDATED_READ_FACTS;
      /** V1: present only on a validated read. */
      readonly validation?: SnapshotValidationReport;
      /** M1: present only when asked for. Assembler-reported, unsigned, B-local. */
      readonly acquisition?: AcquisitionCompanion;
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
      /**
       * P1e: which included incoming claims the loader read the stored reviews
       * of, and how that read ended - UNKNOWN when it was refused or never
       * reported, in which case none of its rows is in `input`. NOT committed
       * by the manifest digest: the reviews read are in `input`.
       */
      readonly incomingClaimReviews: {
        readonly outcome: ClaimReviewRead['outcome'];
        readonly requestedClaimIds: readonly string[];
      };
    }
  | {
      /** S0 refused the retrieved records. The transaction had already ended; no manifest exists. */
      readonly outcome: 'REFUSED';
      readonly code: SnapshotScopeRefusalCode;
      readonly detail: string;
      readonly read: typeof SNAPSHOT_READ_FACTS | typeof VALIDATED_READ_FACTS;
    }
  | {
      readonly outcome: 'SUBJECT_NOT_FOUND';
      readonly focalSubjectId: string;
      readonly read: typeof SNAPSHOT_READ_FACTS | typeof VALIDATED_READ_FACTS;
    };

type SubjectGraph = NonNullable<Awaited<ReturnType<typeof loadSubjectGraph>>>;
type HolderScope = SnapshotScopeInput['scope']['sharedIdentifierHolders'];
type HolderEnumeration = NonNullable<SubjectGraph['sharedIdentifierHolderEnumeration']>;
type IncomingEnumeration = NonNullable<SubjectGraph['incomingRelationshipClaimEnumeration']>;
type SourceSubjectRead = NonNullable<SubjectGraph['incomingClaimSourceSubjectRead']>;
type ClaimReviewRead = NonNullable<SubjectGraph['incomingClaimReviewRead']>;
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
      incomingClaimReviews: 'READ',
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
 * source-subject rows the loader read for those claims (P1d); and the only
 * reviews and attestation references added are the ones the loader read, in
 * full, for those claims (P1e).
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
  // P1e: the stored reviews of the added claims the loader did not reach on its
  // own - used only when the read returned every one of them, and then only
  // the reviews of exactly those claims and the references to their
  // attestations. A partial or refused read adds nothing.
  const claimReviewRead =
    incomingScope.declaration === 'UNKNOWN' ? undefined : graph.incomingClaimReviewRead;
  const reviewedClaims = new Set(
    claimReviewRead?.outcome === 'EVERY_MATCHING_ROW_READ' ? claimReviewRead.requestedClaimIds : [],
  );
  const unreachedClaims = new Set(
    addedClaims.filter((r) => !loadedClaims.has(r.id)).map((r) => r.id),
  );
  const claimReviews = (reviewedClaims.size === 0 ? [] : claimReviewRead!.reviews).filter(
    (v) =>
      v.reviewedRelationshipClaimId !== null &&
      reviewedClaims.has(v.reviewedRelationshipClaimId) &&
      unreachedClaims.has(v.reviewedRelationshipClaimId),
  );
  const claimReviewIds = new Set(claimReviews.map((v) => v.id));
  const claimReviewAttestations = (
    reviewedClaims.size === 0 ? [] : claimReviewRead!.attestationReferences
  ).filter((a) => claimReviewIds.has(a.reviewId));
  // A claim the loader did not reach on its own came with no review chain unless
  // P1e read every review of it; and an added claim's source subject the graph
  // does not hold - read by id (P1d), absent or unknown - had none of its own
  // reviews read, whether or not its row is supplied.
  const reviewChainUnread =
    [...unreachedClaims].some((id) => !reviewedClaims.has(id)) ||
    addedClaims.some((r) => !loadedSubjects.has(r.subjectId));
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
      reviews: [...input.reviews, ...claimReviews],
      attestationReferences: [
        ...attestations.records.map((a) => ({
          id: a.id,
          reviewId: a.reviewId,
          keyId: a.keyId,
          payloadSha256: a.payloadSha256,
        })),
        ...claimReviewAttestations,
      ],
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

type ValidatorInput = Parameters<typeof validateIdentityGraph>[0];

const DECLARATION_STRENGTH: { readonly [K in CategoryDeclaration]: number } = Object.freeze({
  UNKNOWN: 0,
  INCOMPLETE: 1,
  REPRESENTED: 2,
});

/**
 * V1: the categories every focal-record rule's truth depends on. The B2.1
 * rules over a focal record read the focal subject, its claims, its outgoing
 * claims, their targets' PART_OF closure and every review of all of those
 * (which the loader reads in full or refuses), and - for
 * SHARED_EXTERNAL_IDENTIFIER - every other holder of a focal identifier with
 * its claims and their reviews. No focal rule reads an incoming claim, its
 * source subject or its reviews: an incoming source the PART_OF closure does
 * not already hold cannot lie on a structural path from the focal subject.
 */
const FOCAL_RULE_DEPENDENCIES = [
  'FOCAL_SUBJECT',
  'FOCAL_IDENTITY_CLAIMS',
  'OUTGOING_RELATIONSHIP_CLAIMS',
  'SHARED_IDENTIFIER_HOLDERS',
] as const satisfies readonly ScopeCategory[];

/**
 * The partition S0 derives for a finding (manifest.ts `ownerOf`), restated
 * over the records about to be supplied, so that only INPUT and FOCAL_RECORD
 * findings are ever handed to it. S0 re-derives it; a disagreement throws.
 */
function partitionsOf(
  records: ValidatorInput,
  focal: string,
): (finding: IdentityFinding) => FindingPartition {
  const subjects = new Set(records.subjects.map((r) => r.id));
  const claimOwner = new Map<string, string>();
  for (const r of [...records.identityClaims, ...records.relationshipClaims]) {
    claimOwner.set(r.id, r.subjectId);
  }
  const reviewTarget = new Map(
    records.reviews.map((r) => [
      r.id,
      r.reviewedSubjectId ?? r.reviewedIdentityClaimId ?? r.reviewedRelationshipClaimId,
    ]),
  );
  const ownerOf = (id: string, depth: number): string | null => {
    if (depth > 2) return null;
    if (subjects.has(id)) return id;
    if (claimOwner.has(id)) return claimOwner.get(id)!;
    const target = reviewTarget.get(id);
    return target === undefined || target === null ? null : ownerOf(target, depth + 1);
  };
  const supplied = (id: string) => subjects.has(id) || claimOwner.has(id) || reviewTarget.has(id);
  return (f) =>
    f.recordId === 'input'
      ? 'INPUT'
      : !supplied(f.recordId)
        ? 'UNSUPPLIED_RECORD'
        : ownerOf(f.recordId, 0) === focal
          ? 'FOCAL_RECORD'
          : 'NEIGHBOUR_RECORD';
}

/**
 * V1: the base (NOT_RUN) input with the validator's findings and its rule
 * version - publishing only the partitions whose dependencies the read covers
 * (see the file header) - and the report of what was withheld and why. The
 * as-of is the base input's own, unchanged: the one post-snapshot clock
 * reading the loader was handed (R1).
 */
function validatedInputOf(
  base: SnapshotScopeInput,
  graph: SubjectGraph,
): { input: SnapshotScopeInput; report: SnapshotValidationReport } {
  const focal = base.focalSubjectId;
  // One instant, read once: the loader's, S0's VALIDATION_AS_OF and the validator's.
  const asOf = base.validation.asOf;
  if (asOf === null || asOf !== graph.input.asOf) {
    throw new Error('the validation as-of is not the one instant the loader was handed');
  }
  const records: ValidatorInput = {
    subjects: base.records.subjects as ValidatorInput['subjects'],
    identityClaims: base.records.identityClaims as ValidatorInput['identityClaims'],
    relationshipClaims: base.records.relationshipClaims as ValidatorInput['relationshipClaims'],
    reviews: base.records.reviews as ValidatorInput['reviews'],
    knownEcheRowKeys: [...(base.validation.echeRowKeyState?.presentKeys ?? [])],
    asOf,
  };
  const result = validateIdentityGraph(records);
  if (result.ruleVersion !== ACCEPTED_RULE_VERSION) {
    throw new Error(`validator rule version ${String(result.ruleVersion)} is not the accepted one`);
  }
  const partitionOf = partitionsOf(records, focal);

  const published: IdentityFinding[] = [];
  const diagnostics: WithheldDiagnostic[] = [];
  for (const finding of result.findings) {
    const partition = partitionOf(finding);
    if (partition === 'NEIGHBOUR_RECORD') {
      diagnostics.push({ finding, partition, reason: 'NEIGHBOUR_RECORD_PARTIAL_GRAPH' });
    } else if (partition === 'UNSUPPLIED_RECORD') {
      diagnostics.push({ finding, partition, reason: 'UNSUPPLIED_RECORD' });
    } else {
      published.push(finding);
    }
  }

  const categories = base.scope.categories;
  const focalGaps: string[] = FOCAL_RULE_DEPENDENCIES.filter(
    (k) => categories[k] !== 'REPRESENTED',
  ).map((k) => `${k}_${categories[k]}`);
  let focalCoverage = FOCAL_RULE_DEPENDENCIES.map((k) => categories[k]).reduce((a, b) =>
    DECLARATION_STRENGTH[b] < DECLARATION_STRENGTH[a] ? b : a,
  );
  // Every subject the loader's own graph references - claim subjects,
  // relationship targets, enumerated holders - is supplied whenever the
  // database's foreign keys hold. A result where one is not cannot support
  // any focal coverage claim.
  const supplied = new Set(records.subjects.map((r) => r.id));
  const baseReferences = [
    ...graph.input.identityClaims.map((r) => r.subjectId),
    ...graph.input.relationshipClaims.flatMap((r) => [r.subjectId, r.targetSubjectId ?? focal]),
    ...base.scope.sharedIdentifierHolders.holderSubjectIds,
  ];
  if (baseReferences.some((id) => !supplied.has(id))) {
    focalCoverage = 'UNKNOWN';
    focalGaps.push('LOADER_GRAPH_REFERENCE_NOT_SUPPLIED');
  }

  const input: SnapshotScopeInput = {
    ...base,
    findings: published,
    validation: {
      ...base.validation,
      ruleVersion: result.ruleVersion,
      execution: 'CALLER_ASSERTED_RAN',
    },
    scope: {
      ...base.scope,
      categories: {
        ...categories,
        INPUT_SCOPED_FINDINGS: 'REPRESENTED',
        RECORD_SCOPED_FINDINGS: focalCoverage,
        NEIGHBOUR_RECORD_FINDINGS: 'INCOMPLETE',
        VALIDATION_INPUTS: 'REPRESENTED',
      },
    },
  };
  return {
    input,
    report: {
      ruleVersion: ACCEPTED_RULE_VERSION,
      asOf,
      publishedFindingCount: {
        input: published.filter((f) => f.recordId === 'input').length,
        focalRecord: published.filter((f) => f.recordId !== 'input').length,
      },
      focalCoverage,
      focalCoverageGaps: focalGaps,
      withheld: {
        status: 'UNTRUSTED_DIAGNOSTICS_NOT_FINDINGS_NOT_IN_THE_MANIFEST',
        diagnostics,
      },
    },
  };
}

/**
 * M1: what the loader REPORTED about each bounded read, and what the
 * validated read published or withheld - copied, never re-judged; the
 * companion re-derives every status and checks it against the manifest. A
 * bounded read the loader did not report leaves nothing to bind: no result.
 */
function acquisitionObservationsOf(
  graph: SubjectGraph,
  report: SnapshotValidationReport | undefined,
): AcquisitionObservations {
  const holders = graph.sharedIdentifierHolderEnumeration;
  const incoming = graph.incomingRelationshipClaimEnumeration;
  const sources = graph.incomingClaimSourceSubjectRead;
  const reviews = graph.incomingClaimReviewRead;
  if (
    holders === undefined ||
    incoming === undefined ||
    sources === undefined ||
    reviews === undefined
  ) {
    throw new Error('the loader did not report every bounded read the companion binds');
  }
  return {
    holderQuery: {
      outcome: holders.outcome,
      basis: holders.basis,
      queryLimit: holders.queryLimit,
      includedCap: holders.includedCap,
      includedSubjectIds: [...holders.holderSubjectIds],
    },
    incomingQuery: {
      outcome: incoming.outcome,
      basis: incoming.basis,
      queryLimit: incoming.queryLimit,
      includedCap: incoming.includedCap,
      includedClaims: incoming.relationshipClaims.map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
      })),
    },
    sourceRowRead: {
      outcome: sources.outcome,
      requestedSubjectIds: [...sources.requestedSubjectIds],
      readSubjectIds: sources.subjects.map((s) => s.id),
      unreadSubjectIds: [...sources.unreadSubjectIds],
    },
    claimReviewRead: {
      outcome: reviews.outcome,
      requestedClaimIds: [...reviews.requestedClaimIds],
      reviews: reviews.reviews.map((v) => ({
        id: v.id,
        claimId: v.reviewedRelationshipClaimId as string,
        supersedesReviewId: v.supersedesReviewId,
      })),
      attestationReferences: reviews.attestationReferences.map((a) => ({
        id: a.id,
        reviewId: a.reviewId,
      })),
    },
    baseGraph: {
      subjectIds: graph.input.subjects.map((s) => s.id),
      relationshipClaims: graph.input.relationshipClaims.map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
        targetSubjectId: r.targetSubjectId,
      })),
    },
    validation:
      report === undefined
        ? null
        : {
            ruleVersion: report.ruleVersion,
            focalCoverage: report.focalCoverage,
            focalCoverageGaps: [...report.focalCoverageGaps],
            withheld: report.withheld.diagnostics.map((d) => ({
              partition: d.partition as 'NEIGHBOUR_RECORD' | 'UNSUPPLIED_RECORD',
              finding: {
                severity: d.finding.severity,
                code: d.finding.code,
                recordId: d.finding.recordId,
                subjectId: d.finding.subjectId,
                field: d.finding.field,
              },
            })),
          },
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
  options: SnapshotReadOptions = {},
): Promise<SubjectSnapshotReadResult> {
  if (typeof focalSubjectId !== 'string' || !UUID.test(focalSubjectId)) {
    refuse('FOCAL_SUBJECT_ID_MALFORMED', 'the focal subject id must be a lower-case UUID');
  }
  // Only the exact opt-in runs the validator; anything else is the default read.
  const validate = options?.validation === 'RUN';
  const facts = validate ? VALIDATED_READ_FACTS : SNAPSHOT_READ_FACTS;
  const graph = await readGraphInOneSnapshot(source, focalSubjectId);
  if (graph === null) {
    return { outcome: 'SUBJECT_NOT_FOUND', focalSubjectId, read: facts };
  }
  const base = snapshotScopeInputOf(graph);
  const validated = validate ? validatedInputOf(base, graph) : undefined;
  const input = validated?.input ?? base;
  const built = buildSnapshotScopeManifest(input);
  if (built.outcome === 'REFUSED') {
    return {
      outcome: 'REFUSED',
      code: built.code,
      detail: built.detail,
      read: facts,
    };
  }
  // S0 derives every partition itself: anything but INPUT or FOCAL_RECORD here
  // means a withheld finding reached the manifest, and nothing is returned.
  if (
    validated !== undefined &&
    (built.manifest.validation.findings.length !== input.findings.length ||
      built.manifest.validation.findings.some(
        (f) => !(PUBLISHED_PARTITIONS as readonly string[]).includes(f.partition),
      ))
  ) {
    throw new Error('a published finding is not an INPUT or FOCAL_RECORD finding in the manifest');
  }
  const sourceRead = graph.incomingClaimSourceSubjectRead;
  const reviewRead = graph.incomingClaimReviewRead;
  // M1: only the exact opt-in builds the companion; a refused companion returns nothing.
  let acquisition: AcquisitionCompanion | undefined;
  if (options?.acquisitionCompanion === 'BUILD') {
    const companion = buildAcquisitionCompanion({
      manifest: built.manifest,
      input,
      observations: acquisitionObservationsOf(graph, validated?.report),
    });
    if (companion.outcome === 'REFUSED') {
      throw new Error(
        `the acquisition companion was refused: ${companion.code} (${companion.detail})`,
      );
    }
    acquisition = companion.companion;
  }
  return {
    outcome: 'BUILT',
    manifest: built.manifest,
    canonical: built.canonical,
    input,
    read: facts,
    ...(validated !== undefined ? { validation: validated.report } : {}),
    ...(acquisition !== undefined ? { acquisition } : {}),
    incomingClaimSourceSubjects: {
      outcome: sourceRead?.outcome ?? 'UNKNOWN',
      requestedSubjectIds: [...(sourceRead?.requestedSubjectIds ?? [])],
      unreadSubjectIds: [...(sourceRead?.unreadSubjectIds ?? [])],
    },
    incomingClaimReviews: {
      outcome: reviewRead?.outcome ?? 'UNKNOWN',
      requestedClaimIds: [...(reviewRead?.requestedClaimIds ?? [])],
    },
  };
}
