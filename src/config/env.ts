import { z } from 'zod';

/**
 * Configuration is validated once, at process start, and fails fast.
 * There is no fallback to a default database URL: an unset value is an error,
 * never a silent connection to something unexpected.
 */
const EnvSchema = z.object({
  DATABASE_URL_ADMIN: z.string().min(1).optional(),
  DATABASE_URL_INGEST: z.string().min(1).optional(),
  DATABASE_URL_READONLY: z.string().min(1).optional(),
  // Phase 2B research role. Append-only on orgunit_* and read-only on the
  // source evidence it derives roots from; see migration 0007.
  DATABASE_URL_RESEARCH: z.string().min(1).optional(),
  // Phase 2B-2 semantic-classifier role. Append-only on the four classifier
  // tables and read-only on the upstream evidence it classifies; see
  // migration 0009. Deliberately narrower than DATABASE_URL_RESEARCH - no
  // grant on website_claims or root authority at all.
  DATABASE_URL_CLASSIFIER: z.string().min(1).optional(),
  // Track B B2.2 discovery-subject registry writer (migration 0014). A login
  // the DEPLOYMENT provisions and grants the NOLOGIN
  // nwf_discovery_subject_writer capability; no migration creates it and
  // .env.example holds no value for it. Read only by `discovery-subjects ...
  // --execute`. Never an owner or superuser connection - the command refuses
  // both. Named for the discovery-subject registry ONLY: it is not a canonical
  // identity credential and issues no canonical identifier (ADR 0020 s12).
  DATABASE_URL_DISCOVERY_SUBJECT_WRITER: z.string().min(1).optional(),
  // Track B B2.3 discovery-subject reviewer (migration 0015). A login the
  // DEPLOYMENT provisions and grants the NOLOGIN nwf_discovery_subject_reviewer
  // capability; no migration creates it and .env.example holds no value for
  // it. Read only by `discovery-subjects review --execute --envelope`. Never
  // an owner, a superuser or a writer connection - the command refuses all
  // three. The connection is a CAPABILITY, not authority: a review needs a
  // verified OWNER signature (ADR 0023).
  DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER: z.string().min(1).optional(),
  // REL L2/P2 source-discovery capability (migrations 0019/0020). A login the
  // DEPLOYMENT provisions - or, locally, a DISPOSABLE test database's harness
  // - and grants the NOLOGIN nwf_source_discovery capability; no migration
  // creates it and .env.example holds no value for it. Read only by
  // `orgunits subjects research --execute`: present, the run's off-domain
  // link-outs are recorded as nominations (never fetched); absent, they are
  // discarded and the command says so. There is no fallback to any other
  // connection: the research role is never used in its place.
  DATABASE_URL_SOURCE_DISCOVERY: z.string().min(1).optional(),
  // WW E-Q acquisition worker (migration 0023). A login the DEPLOYMENT
  // provisions - or, locally, a DISPOSABLE test database's harness - and
  // grants the NOLOGIN nwf_acquisition_worker capability; no migration creates
  // it and .env.example holds no value for it. Read only by `acquisition
  // worker`. Holding it is not campaign authority: a campaign counts only if
  // its OWNER signature verifies under the pinned trust set (ADR 0029).
  DATABASE_URL_ACQUISITION_WORKER: z.string().min(1).optional(),
  // Integration tests truncate tables, so they target a separate database.
  DATABASE_URL_ADMIN_TEST: z.string().min(1).optional(),
  DATABASE_URL_INGEST_TEST: z.string().min(1).optional(),
  DATABASE_URL_READONLY_TEST: z.string().min(1).optional(),
  DATABASE_URL_RESEARCH_TEST: z.string().min(1).optional(),
  DATABASE_URL_CLASSIFIER_TEST: z.string().min(1).optional(),
  DATABASE_URL_DISCOVERY_SUBJECT_WRITER_TEST: z.string().min(1).optional(),
  DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER_TEST: z.string().min(1).optional(),
  DATABASE_URL_SOURCE_DISCOVERY_TEST: z.string().min(1).optional(),
  DATABASE_URL_ACQUISITION_WORKER_TEST: z.string().min(1).optional(),
  NWF_PE_VERBOSE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  cached = parsed.data;
  return cached;
}

export type Role =
  | 'admin'
  | 'ingest'
  | 'readonly'
  | 'research'
  | 'classifier'
  | 'discovery_subject_writer'
  | 'discovery_subject_reviewer'
  | 'source_discovery'
  | 'acquisition_worker';

const ROLE_VAR: Record<Role, keyof Env> = {
  admin: 'DATABASE_URL_ADMIN',
  ingest: 'DATABASE_URL_INGEST',
  readonly: 'DATABASE_URL_READONLY',
  research: 'DATABASE_URL_RESEARCH',
  classifier: 'DATABASE_URL_CLASSIFIER',
  discovery_subject_writer: 'DATABASE_URL_DISCOVERY_SUBJECT_WRITER',
  discovery_subject_reviewer: 'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER',
  source_discovery: 'DATABASE_URL_SOURCE_DISCOVERY',
  acquisition_worker: 'DATABASE_URL_ACQUISITION_WORKER',
};

const ROLE_VAR_TEST: Record<Role, keyof Env> = {
  admin: 'DATABASE_URL_ADMIN_TEST',
  ingest: 'DATABASE_URL_INGEST_TEST',
  readonly: 'DATABASE_URL_READONLY_TEST',
  research: 'DATABASE_URL_RESEARCH_TEST',
  classifier: 'DATABASE_URL_CLASSIFIER_TEST',
  discovery_subject_writer: 'DATABASE_URL_DISCOVERY_SUBJECT_WRITER_TEST',
  discovery_subject_reviewer: 'DATABASE_URL_DISCOVERY_SUBJECT_REVIEWER_TEST',
  source_discovery: 'DATABASE_URL_SOURCE_DISCOVERY_TEST',
  acquisition_worker: 'DATABASE_URL_ACQUISITION_WORKER_TEST',
};

/** Connection string for a role against the integration-test database. */
export function testDatabaseUrl(role: Role): string | undefined {
  return env()[ROLE_VAR_TEST[role]];
}

/** Returns the connection string for a role, or throws with actionable guidance. */
export function databaseUrl(role: Role): string {
  const varName = ROLE_VAR[role];
  const value = env()[varName];
  if (!value) {
    throw new Error(
      `${varName} is not set. Copy .env.example to .env and start the local database ` +
        `with \`docker compose up -d\`.`,
    );
  }
  return value;
}

export function isVerbose(): boolean {
  return env().NWF_PE_VERBOSE === '1';
}
