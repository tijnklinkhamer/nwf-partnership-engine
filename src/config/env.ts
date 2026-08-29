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
  // Integration tests truncate tables, so they target a separate database.
  DATABASE_URL_ADMIN_TEST: z.string().min(1).optional(),
  DATABASE_URL_INGEST_TEST: z.string().min(1).optional(),
  DATABASE_URL_READONLY_TEST: z.string().min(1).optional(),
  DATABASE_URL_RESEARCH_TEST: z.string().min(1).optional(),
  DATABASE_URL_CLASSIFIER_TEST: z.string().min(1).optional(),
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

export type Role = 'admin' | 'ingest' | 'readonly' | 'research' | 'classifier';

const ROLE_VAR: Record<Role, keyof Env> = {
  admin: 'DATABASE_URL_ADMIN',
  ingest: 'DATABASE_URL_INGEST',
  readonly: 'DATABASE_URL_READONLY',
  research: 'DATABASE_URL_RESEARCH',
  classifier: 'DATABASE_URL_CLASSIFIER',
};

const ROLE_VAR_TEST: Record<Role, keyof Env> = {
  admin: 'DATABASE_URL_ADMIN_TEST',
  ingest: 'DATABASE_URL_INGEST_TEST',
  readonly: 'DATABASE_URL_READONLY_TEST',
  research: 'DATABASE_URL_RESEARCH_TEST',
  classifier: 'DATABASE_URL_CLASSIFIER_TEST',
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
