/**
 * WW E-W FIREWALL - the acquisition WIRING (OWNER directive 2026-10-27,
 * ADR 0030, migration 0024). Pinned by path and content, never by commit:
 *
 *   - the namespace `src/orgunits/acquisitionWiring/` is exactly the named
 *     files, each importing exactly the named modules: one port per foreign
 *     namespace (source discovery, the read-only exports), one registry
 *     bridge, one review bridge, and the existing research path;
 *   - it opens no socket, spawns nothing and imports no SDK: the granted
 *     search reaches the provider only through the injected live-search
 *     dependencies, and research only through `subjectRun/`;
 *   - the only private-key operation is the offline campaign signer's; the
 *     only key decryption is the B2.3 signer's, reached via reviewBridge;
 *   - the only file writes are the outbox's (0600 files, 0700 dirs);
 *   - production handlers use the OPERATIONAL scope and inject nothing into
 *     research; no test seam (vitestOnly, ephemeralForVitest, a cohort
 *     loader) is named in production;
 *   - no handler exists for the human gate; the review command signs only
 *     subjects listed one by one;
 *   - only the CLI and the wiring reach `acquisition/` from outside it;
 *   - migration 0024 grants only SELECT/INSERT/USAGE, has no SECURITY
 *     DEFINER, no LOGIN, no UPDATE/DELETE grant, no contact/score/verdict/
 *     country column, never lets the worker write a campaign or control
 *     event, and keeps SEED roots owner-only.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACQUISITION_OPTIONS } from '../../cli/commands/acquisition.js';
import { WIRED_STAGES } from '../../orgunits/acquisitionWiring/index.js';
import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const NS = 'src/orgunits/acquisitionWiring/';
const CLI = 'src/cli/commands/acquisition.ts';
const MIGRATION = 'migrations/0024_campaign_research_admission_and_wiring.sql';

/** Every file, and exactly the module specifiers it may name. */
const FILES: Readonly<Record<string, readonly string[]>> = {
  'campaignSigner.ts': [
    'node:crypto',
    '../acquisition/index.js',
    '../acquisition/document.js',
    '../acquisition/canonical.js',
  ],
  'context.ts': ['node:crypto', 'pg', '../orchestrator/rootRunner.js', './sourceDiscoveryPort.js'],
  // WW H-ACQ (lead addendum, exact path): country mentions in a subject's own
  // captured pages, and the OWNER's --country statement through the existing
  // jurisdiction-claim writer (the assigned ISO list only; no inference).
  'countryMentions.ts': [
    'pg',
    '../jurisdictionClaimWriter/record.js',
    '../subjectJurisdiction/vocabulary.js',
  ],
  'dedupe.ts': [
    'pg',
    '../acquisition/index.js',
    './sourceDiscoveryPort.js',
    './context.js',
    './discover.js',
    './records.js',
  ],
  'discover.ts': [
    'pg',
    '../acquisition/index.js',
    './sourceDiscoveryPort.js',
    './context.js',
    './records.js',
  ],
  'exportPort.ts': ['../qualificationInputV2/load.js', '../subjectFacts/load.js'],
  'handlers.ts': [
    '../acquisition/index.js',
    './context.js',
    './dedupe.js',
    './discover.js',
    './outbox.js',
    './promote.js',
    './research.js',
  ],
  'index.ts': [
    './campaignSigner.js',
    './context.js',
    './countryMentions.js',
    './handlers.js',
    './outbox.js',
    // R3 (PROPOSED, exact widening): the passphrase from an inherited pipe.
    './passphraseFd.js',
    './production.js',
    './records.js',
    './review.js',
    './reviewBridge.js',
    './status.js',
  ],
  'outbox.ts': [
    'node:crypto',
    'node:fs',
    'node:path',
    '../acquisition/index.js',
    './exportPort.js',
    './context.js',
    './records.js',
  ],
  // R3 (PROPOSED): `review sign --passphrase-fd` — reads ONE inherited pipe (node:fs only).
  'passphraseFd.ts': ['node:fs'],
  'production.ts': [
    'pg',
    '../acquisition/index.js',
    './sourceDiscoveryPort.js',
    './context.js',
    './handlers.js',
  ],
  'promote.ts': [
    '../acquisition/index.js',
    './sourceDiscoveryPort.js',
    './context.js',
    './records.js',
    './registryBridge.js',
  ],
  'records.ts': ['pg', '../acquisition/index.js', './context.js'],
  'registryBridge.ts': [
    'pg',
    '../subjectRegistry/readModel.js',
    '../subjectRegistry/requests.js',
    '../subjectRegistry/store.js',
    '../subjectRegistry/writer.js',
    './sourceDiscoveryPort.js',
  ],
  'research.ts': [
    'pg',
    '../acquisition/index.js',
    '../classify/evaluationCohortGuard.js',
    '../subjectAdmission/registryDigest.js',
    '../subjectRun/admission.js',
    '../subjectRun/execute.js',
    './context.js',
    './sourceDiscoveryPort.js',
    './records.js',
    './registryBridge.js',
  ],
  'review.ts': [
    'pg',
    '../acquisition/index.js',
    './countryMentions.js',
    './exportPort.js',
    './reviewBridge.js',
  ],
  'reviewBridge.ts': [
    'node:crypto',
    'pg',
    '../subjectRegistry/readModel.js',
    '../subjectRegistry/reviewAuthority.js',
    '../subjectRegistry/store.js',
    '../subjectRegistry/writer.js',
    '../subjectReview/signer.js',
    '../subjectReview/trust.js',
    '../subjectReview/verify.js',
  ],
  'sourceDiscoveryPort.ts': [
    '../sourceDiscovery/index.js',
    '../sourceDiscovery/identityBridge.js',
    '../sourceDiscovery/nomination.js',
    '../sourceDiscovery/promote.js',
    '../sourceDiscovery/store.js',
  ],
  // R2 (migration 0029, exact path): the status derives a continuation
  // nomination's OUT_OF_SCOPE skip with the dedupe stage's own geography rule.
  'status.ts': ['pg', '../acquisition/index.js', './dedupe.js'],
};

const code = (file: string): string => codeOf(readCurrent(file));

describe('WW E-W: the wiring namespace is exactly what was approved', () => {
  it('holds exactly the named files, each importing exactly its named modules', () => {
    expect(readdirSync(join(REPO_ROOT, NS)).sort()).toEqual(Object.keys(FILES).sort());
    for (const [file, allowed] of Object.entries(FILES)) {
      expect([...new Set(specifiers(code(NS + file)))].sort(), file).toEqual([...allowed].sort());
    }
  });

  it('opens no socket, spawns nothing, imports no SDK and names no gateway', () => {
    for (const file of Object.keys(FILES)) {
      const c = code(NS + file);
      expect(c, file).not.toMatch(
        /node:(net|tls|http|https|dns|dgram|child_process|worker_threads|cluster)\b|\bfetch\s*\(|\bspawn\s*\(|\bexec(File)?\s*\(|claude-agent-sdk|@anthropic|executeWebAttempt|orgunits\/web|\.\.\/web\//,
      );
    }
  });

  it('issues only SELECT and INSERT, and writes files only in the outbox', () => {
    for (const file of Object.keys(FILES)) {
      const c = code(NS + file);
      expect(c, file).not.toMatch(
        /\b(UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE)\b|DO\s+UPDATE/,
      );
      if (file !== 'outbox.ts') {
        expect(c, file).not.toMatch(
          /writeFile|writeSync|appendFile|createWriteStream|renameSync|mkdirSync/,
        );
      }
    }
    const outbox = code(`${NS}outbox.ts`);
    expect(outbox).toContain('mkdirSync(path, { recursive: true, mode: 0o700 });');
    expect(outbox).toContain('0o600');
    expect(outbox).toContain('fsConstants.O_NOFOLLOW');
    expect(outbox).not.toMatch(/\bbody\b|raw_html|main_text/);
  });

  it('keeps private-key work in the campaign signer and decryption in the B2.3 signer', () => {
    for (const file of Object.keys(FILES)) {
      const c = code(NS + file);
      if (file !== 'campaignSigner.ts') {
        expect(c, file).not.toMatch(/ed25519Sign|\bsign\s+as\b|from 'node:crypto'[^;]*\bsign\b/);
      }
      expect(c, file).not.toMatch(/createPrivateKey|generateKeyPair|PRIVATE KEY-----/);
    }
    expect(code(`${NS}reviewBridge.ts`)).toContain('decryptSigningKey(pem, secret)');
  });

  it('names no test seam in production and injects nothing into research', () => {
    for (const file of Object.keys(FILES)) {
      expect(code(NS + file), file).not.toMatch(
        /vitestOnly|ephemeralForVitest|forVitestUnverified|testSeam/,
      );
    }
    const production = code(`${NS}production.ts`);
    expect(production).toContain('research: {},');
    expect(production).toContain("campaignTrustScope: 'OPERATIONAL',");
    expect(production).not.toMatch(/loadCohortRegistry|transport/);
  });

  it('wires every worker stage and never the human gate', () => {
    expect(WIRED_STAGES).not.toContain('IDENTITY_REVIEW');
    expect(code(`${NS}handlers.ts`)).not.toMatch(/stage: 'IDENTITY_REVIEW'/);
    for (const file of Object.keys(FILES)) {
      expect(code(NS + file), file).not.toMatch(/stage:\s*'IDENTITY_REVIEW'/);
    }
  });

  it('signs a review only for subjects listed one by one: no all-subjects form', () => {
    const review = ACQUISITION_OPTIONS['review sign'];
    // WW H-ACQ (P2-4, exact name): one `--expect <subjectId>=<stateDigest>`
    // per listed subject binds each signature to the state the OWNER saw;
    // (lead addendum, exact name) an optional `--country` per listed subject
    // cites one shown country-mention line of its own captured page.
    expect(Object.keys(review).sort()).toEqual(
      [
        'campaign-id',
        'subject-id',
        'expect',
        'country',
        'key-file',
        'key-id',
        // R3 (PROPOSED, exact name): the passphrase from an inherited pipe, never a value.
        'passphrase-fd',
        'execute',
        'json',
      ].sort(),
    );
    expect(code(`${NS}review.ts`)).toContain("throw new ReviewBatchRefusal('SUBJECTS_REQUIRED')");
    expect(code(`${NS}review.ts`)).toContain("'SUBJECT_NOT_AWAITING_REVIEW'");
    expect(code(`${NS}review.ts`)).toContain('await signAndAppendSubjectReview(');
    expect(code(`${NS}reviewBridge.ts`)).toContain("outcome: 'CONFIRMED',");
  });

  it('only the CLI and the wiring reach the acquisition namespace from outside it', () => {
    const importers = productionFiles().filter(
      (f) =>
        !f.startsWith('src/orgunits/acquisition/') &&
        specifiers(code(f)).some((s) => /(^|\/)acquisition\/[a-z]+\.js$/.test(s)),
    );
    // WW E-M: the Mac runtime reads whether an OWNER campaign key is pinned,
    // through the public index only, at this one exact path - the same pin
    // wwAcquisitionQueue.firewall.test.ts and wwMacRuntime.firewall.test.ts
    // already carry. Merged by exact path, never by pattern.
    expect(importers.filter((f) => !f.startsWith(NS))).toEqual([
      CLI,
      'src/runtime/campaignTrust.ts',
    ]);
  });
});

describe('WW E-W: migration 0024 is append-only and least-privilege', () => {
  const sql = readCurrent(MIGRATION).replace(/--.*$/gm, '');
  const grants = [...sql.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+([\s\S]*?);/g)].map(
    (m) => ({
      privileges: m[1]!
        .replace(/\([^)]*\)/g, '')
        .split(',')
        .map((p) => p.trim().toUpperCase()),
      objects: m[2]!.split(',').map((o) => o.trim()),
      grantees: m[3]!.split(',').map((g) => g.trim()),
    }),
  );

  it('grants only SELECT and INSERT, never a mutating privilege, and defines no SECURITY DEFINER', () => {
    for (const g of grants) for (const p of g.privileges) expect(['SELECT', 'INSERT']).toContain(p);
    expect(sql).not.toMatch(/GRANT\s+(ALL|UPDATE|DELETE|TRUNCATE|TEMPORARY)/i);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER|CREATE ROLE|\bLOGIN\b/i);
  });

  it('never lets the worker write a campaign or a control event', () => {
    for (const g of grants) {
      if (!g.grantees.includes('nwf_acquisition_worker') || !g.privileges.includes('INSERT'))
        continue;
      expect(g.objects).not.toContain('acquisition_campaigns');
      expect(g.objects).not.toContain('acquisition_campaign_control_events');
    }
  });

  it('makes every new table append-only and adds no contact, score, verdict or country column', () => {
    for (const table of [
      'acquisition_campaign_subjects',
      'acquisition_signals',
      'acquisition_outbox_entries',
      'acquisition_claim_lease_extensions',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\\(\\);`,
        ),
      );
    }
    const columns = [
      ...sql.matchAll(/^\s{4}(\w+)\s+(uuid|text|jsonb|integer|timestamptz|boolean|bytea)/gm),
    ].map((m) => m[1]!);
    expect(columns.length).toBeGreaterThan(30);
    for (const column of columns) {
      expect(column).not.toMatch(
        /email|phone|contact|person|score|rank|relevan|verdict|verified|country|locale|market|language/,
      );
    }
  });

  it('keeps SEED roots owner-only and widens the non-owner root rule by ONE exact branch', () => {
    expect(sql).toContain(
      "IF NOT (NEW.source_kind = 'LINK_OUT' AND NEW.subject_kind = 'RESEARCH_RUN'",
    );
    expect(sql).toContain("AND a.admission_basis = 'CAMPAIGN'");
    expect(sql).toContain(
      "MESSAGE = 'acquisition_work_items: only the owner path may seed a link-out or seed-list root'",
    );
  });

  it('binds a CAMPAIGN admission to its own policy version, campaign, work item and a one-day bound', () => {
    expect(sql).toContain("policy_version = 'subject-research-admission-policy-campaign-v1'");
    expect(sql).toContain('AND validity_seconds <= 86400');
    expect(sql).toContain('only the owner path may record an OWNER_REVIEWED admission');
  });
});
