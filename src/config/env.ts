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
  // Integration tests truncate tables, so they target a separate database.
  DATABASE_URL_ADMIN_TEST: z.string().min(1).optional(),
  DATABASE_URL_INGEST_TEST: z.string().min(1).optional(),
  DATABASE_URL_READONLY_TEST: z.string().min(1).optional(),
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

export type Role = 'admin' | 'ingest' | 'readonly';

const ROLE_VAR: Record<Role, keyof Env> = {
  admin: 'DATABASE_URL_ADMIN',
  ingest: 'DATABASE_URL_INGEST',
  readonly: 'DATABASE_URL_READONLY',
};

const ROLE_VAR_TEST: Record<Role, keyof Env> = {
  admin: 'DATABASE_URL_ADMIN_TEST',
  ingest: 'DATABASE_URL_INGEST_TEST',
  readonly: 'DATABASE_URL_READONLY_TEST',
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
