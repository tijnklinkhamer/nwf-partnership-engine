/**
 * PHASE-1A-FIREWALL
 *
 * Executable proof that this repository has no research, outbound, or NWF
 * production capability. Phase 1A is approved for ECHE ingestion only; every
 * later phase requires separate founder approval.
 *
 * These assertions target real capabilities - dependencies, API hosts, client
 * constructs and credential identifiers - NOT ordinary English words. A firewall
 * that fails on the word "email" appearing in a comment trains people to weaken
 * it, so the scans below deliberately exclude documentation prose and this file.
 *
 * NEVER weaken a firewall test to make CI green. If one fails, the code is wrong.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'src/test/firewall/phase1a.firewall.test.ts';

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

/** Every executable source file, excluding this firewall and test fixtures. */
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const absolute = resolve(dir, entry);
      if (statSync(absolute).isDirectory()) {
        if (absolute.includes(`${sep}fixtures`)) continue;
        walk(absolute);
        continue;
      }
      if (!/\.(ts|mjs|js)$/.test(entry)) continue;
      const rel = relative(ROOT, absolute).split(sep).join('/');
      if (rel === SELF) continue;
      files.push(rel);
    }
  };
  walk(resolve(ROOT, 'src'));
  walk(resolve(ROOT, 'scripts'));
  return files;
}

const SOURCE_FILES = sourceFiles();
const PACKAGE_JSON = JSON.parse(read('package.json')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const ALL_DEPENDENCIES = {
  ...(PACKAGE_JSON.dependencies ?? {}),
  ...(PACKAGE_JSON.devDependencies ?? {}),
};

describe('PHASE-1A-FIREWALL: no AI/research capability', () => {
  it('declares no Anthropic SDK dependency', () => {
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(name).not.toBe('@anthropic-ai/sdk');
      expect(name.startsWith('@anthropic-ai/')).toBe(false);
      expect(name).not.toBe('anthropic');
    }
  });

  it('has no Anthropic API host or client construct in source', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} references the Anthropic API host`).not.toContain(
        'api.anthropic.com',
      );
      expect(source, `${file} references a Claude model id`).not.toMatch(/claude-[a-z0-9-]*\d/);
      expect(source, `${file} references an Anthropic credential`).not.toContain(
        'ANTHROPIC_API_KEY',
      );
    }
  });

  it('has no lockfile entry for an Anthropic package', () => {
    expect(read('package-lock.json')).not.toContain('@anthropic-ai/sdk');
  });
});

describe('PHASE-1A-FIREWALL: no Apollo capability', () => {
  it('declares no Apollo dependency', () => {
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(name.includes('apollo')).toBe(false);
    }
  });

  it('has no Apollo API host, endpoint or credential in source', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} references the Apollo API host`).not.toContain('api.apollo.io');
      expect(source, `${file} references the Apollo MCP host`).not.toContain('mcp.apollo.io');
      expect(source, `${file} references an Apollo sequence endpoint`).not.toContain(
        'emailer_campaign',
      );
      expect(source, `${file} references an Apollo credential header`).not.toContain('x-api-key');
      expect(source, `${file} references an Apollo credential`).not.toMatch(/APOLLO_API_KEY/);
    }
  });
});

describe('PHASE-1A-FIREWALL: no outbound sending capability', () => {
  it('declares no email-sending dependency', () => {
    const forbidden = [
      'resend',
      'nodemailer',
      '@sendgrid/mail',
      'postmark',
      'mailgun.js',
      '@aws-sdk/client-ses',
    ];
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(forbidden, `${name} is an email-sending dependency`).not.toContain(name);
    }
  });

  it('has no email provider host or credential in source', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} references the Resend API host`).not.toContain('api.resend.com');
      expect(source, `${file} references a Resend credential`).not.toContain('RESEND_API_KEY');
      expect(source, `${file} references the SendGrid API host`).not.toContain('api.sendgrid.com');
      expect(source, `${file} references the Mailgun API host`).not.toContain('api.mailgun.net');
      expect(source, `${file} references the Postmark API host`).not.toContain(
        'api.postmarkapp.com',
      );
      expect(source, `${file} opens an SMTP transport`).not.toMatch(/createTransport\s*\(/);
    }
  });

  it('has no outbound flag, gate or sequence construct implying send capability', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} defines an outbound flag`).not.toContain('OUTBOUND_ENABLED');
      expect(source, `${file} defines an outbound gate`).not.toContain('assertOutboundAllowed');
    }
  });

  it('performs no network write: source contains no non-GET fetch', () => {
    for (const file of SOURCE_FILES) {
      const source = read(file);
      expect(source, `${file} issues a non-GET HTTP method`).not.toMatch(
        /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
      );
    }
  });
});

describe('PHASE-1A-FIREWALL: no NWF production access', () => {
  it('contains no NWF Supabase project reference or credential', () => {
    for (const file of [...SOURCE_FILES, 'package.json', '.env.example', 'docker-compose.yml']) {
      const source = read(file);
      // The NWF production project ref must never appear in this repository.
      expect(source, `${file} references the NWF Supabase project`).not.toContain(
        'zskzmqegettszojybjmi',
      );
      expect(source, `${file} references a Supabase host`).not.toContain('supabase.co');
      expect(source, `${file} references a Supabase service role key`).not.toContain(
        'SUPABASE_SERVICE_ROLE_KEY',
      );
      expect(source, `${file} references a Stripe credential`).not.toContain('STRIPE_SECRET_KEY');
    }
  });

  it('declares no Supabase or Stripe dependency', () => {
    for (const name of Object.keys(ALL_DEPENDENCIES)) {
      expect(name.includes('supabase')).toBe(false);
      expect(name.includes('stripe')).toBe(false);
    }
  });

  it('only ever connects to a database url supplied by the local environment', () => {
    const env = read('src/config/env.ts');
    // No hardcoded fallback connection string may exist.
    expect(env).not.toMatch(/postgres(ql)?:\/\/[^'"`\s]*['"]/);
  });
});

describe('PHASE-1A-FIREWALL: scope boundaries hold', () => {
  it('implements no contact, scoring, compliance, template or suppression module', () => {
    const forbiddenDirs = [
      'src/contacts',
      'src/qualify',
      'src/compliance',
      'src/templates',
      'src/outreach',
      'src/suppression',
      'src/research',
      'src/apollo',
    ];
    for (const dir of forbiddenDirs) {
      let exists = true;
      try {
        statSync(resolve(ROOT, dir));
      } catch {
        exists = false;
      }
      expect(exists, `${dir} exists but its phase is not approved`).toBe(false);
    }
  });

  it('has no committed .env file', () => {
    let exists = true;
    try {
      statSync(resolve(ROOT, '.env'));
    } catch {
      exists = false;
    }
    // A local .env is expected on a developer machine; it must be gitignored.
    if (exists) {
      expect(read('.gitignore')).toMatch(/^\.env$/m);
    }
  });

  it('keeps .env.example free of anything resembling a real secret', () => {
    const example = read('.env.example');
    expect(example).toContain('local_dev_only');
    // No long opaque tokens.
    expect(example).not.toMatch(/[A-Za-z0-9_-]{40,}/);
  });
});
