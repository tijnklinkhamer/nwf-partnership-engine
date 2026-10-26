/**
 * REL harvest - a shared, SYNTHETIC subject-research harness for integration
 * tests (`*_test` databases only).
 *
 * The same path the Lane L1 integration test drives inline: every subject is
 * written by the B2.2 CLI on a disposable writer login, every review by the
 * B2.3 reviewer path on a disposable reviewer login with a TEST-ONLY Ed25519
 * key, and every admission on the OWNER path under the caller's synthetic
 * cohort registry. Requests go to a SCRIPTED transport; nothing leaves the
 * process. Optionally creates a disposable login holding the REL L2
 * `nwf_source_discovery` capability, for the link-out sink.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runDiscoverySubjects } from '../../cli/commands/discoverySubjects.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { recordSubjectResearchAdmission } from '../../orgunits/subjectAdmission/record.js';
import { deriveSubjectReadModel } from '../../orgunits/subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../../orgunits/subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../../orgunits/subjectRegistry/store.js';
import {
  appendAttestedReview,
  prepareReview,
  type ReviewRequest,
} from '../../orgunits/subjectRegistry/writer.js';
import { VerifiedReviewEnvelope } from '../../orgunits/subjectReview/verify.js';
import type {
  RequestPlan,
  ResolvedAddress,
  TransportOutcome,
  WebTransport,
} from '../../orgunits/web/gateway.js';
import { signIntent, testReviewKey, testTrust, trustEntry } from './ownerReviewFixtures.js';

export const OBSERVED = '2026-10-26T09:00:00Z';
export const ALLOW_ALL = 'User-agent: *\nAllow: /\n';
const PUBLIC_V4: ResolvedAddress = { address: '193.51.196.10', family: 4 };
const VALIDITY = 7 * 24 * 60 * 60;

export class ScriptedTransport implements WebTransport {
  readonly resolvedHosts: string[] = [];
  readonly requestedUrls: string[] = [];
  private readonly routes = new Map<string, TransportOutcome>();

  route(url: string, outcome: TransportOutcome): this {
    this.routes.set(url, outcome);
    return this;
  }

  resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
    this.resolvedHosts.push(hostname);
    return Promise.resolve([PUBLIC_V4]);
  }

  execute(plan: RequestPlan): Promise<TransportOutcome> {
    this.requestedUrls.push(plan.url);
    return Promise.resolve(
      this.routes.get(plan.url) ?? {
        kind: 'RESPONSE',
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('not found'),
        truncated: false,
      },
    );
  }
}

export function response(status: number, body: string, contentType: string): TransportOutcome {
  return {
    kind: 'RESPONSE',
    status,
    headers: { 'content-type': contentType },
    body: Buffer.from(body, 'utf8'),
    truncated: false,
  };
}

export const html = (body: string): TransportOutcome =>
  response(200, body, 'text/html; charset=utf-8');

/** One page; each link is `[href, anchor text]`. */
export function page(
  lang: string,
  title: string,
  text: string,
  links: readonly (readonly [string, string])[] = [],
): string {
  const anchors = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' ');
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title></head>` +
    `<body><main><h1>${title}</h1><p>${text}</p><nav>${anchors}</nav></main></body></html>`
  );
}

export const instantClock = () => ({ now: () => Date.now(), sleep: () => Promise.resolve() });

export interface RelSubjectHarness {
  /** Creates the disposable logins (and grants) and their pools. */
  setUp(admin: pg.Pool, options?: { sourceDiscoveryLogin?: boolean }): Promise<void>;
  /** A pool on the disposable login holding `nwf_source_discovery` (setUp option). */
  sourceDiscoveryPool(): pg.Pool;
  tearDown(admin: pg.Pool): Promise<void>;
  /** propose + website claim + one signed TEST_ONLY CONFIRMED review. */
  confirmedSubject(
    readonly: pg.Pool,
    name: string,
    website: string,
  ): Promise<{ subjectId: string; websiteClaimId: string }>;
  /** One OWNER admission under the given cohort registry and the test trust. */
  admit(
    admin: pg.Pool,
    subjectId: string,
    rootClaimId: string,
    loadCohortRegistry: () => RegistryLoadResult,
  ): Promise<string>;
}

export function createRelSubjectHarness(tag: string): RelSubjectHarness {
  if (!/^[a-z0-9]{2,12}$/.test(tag)) throw new Error(`bad harness tag ${tag}`);
  const suffix = randomBytes(4).toString('hex');
  const writerLogin = `nwf_${tag}_writer_${suffix}`;
  const reviewerLogin = `nwf_${tag}_reviewer_${suffix}`;
  const sourceLogin = `nwf_${tag}_source_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const key = testReviewKey(`test-owner-${tag}`);
  const trust = testTrust(trustEntry(key));
  const logins: string[] = [];
  const pools: pg.Pool[] = [];
  let reviewer: pg.Pool | null = null;
  let source: pg.Pool | null = null;

  const loginUrl = (login: string): string => {
    const url = new URL(testDatabaseUrl('admin')!);
    url.username = login;
    url.password = password;
    return url.toString();
  };

  const newPool = (login: string): pg.Pool => {
    const pool = new pg.Pool({ connectionString: loginUrl(login), max: 2 });
    pools.push(pool);
    return pool;
  };

  async function registry(argv: string[]): Promise<void> {
    const err: string[] = [];
    const exit = await runDiscoverySubjects([...argv, '--json'], {
      readonlyPool: () => new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 2 }),
      writerPool: () => new pg.Pool({ connectionString: loginUrl(writerLogin), max: 2 }),
      reviewerPool: () => new pg.Pool({ connectionString: loginUrl(reviewerLogin), max: 2 }),
      trust,
      out: () => undefined,
      err: (t) => void err.push(t),
    });
    expect(exit, err.join('')).toBe(0);
  }

  const sourceArgs = (path: string) => [
    '--source-url',
    `https://sources.${tag}-pilot-example.org/${path}`,
    '--observed-at',
    OBSERVED,
    '--basis',
    'SOURCE_STATED',
  ];

  return {
    async setUp(admin, options = {}) {
      const wanted: [string, string][] = [
        [writerLogin, 'nwf_discovery_subject_writer'],
        [reviewerLogin, 'nwf_discovery_subject_reviewer'],
      ];
      if (options.sourceDiscoveryLogin === true) wanted.push([sourceLogin, 'nwf_source_discovery']);
      for (const [login, capability] of wanted) {
        await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'`);
        logins.push(login);
        await admin.query(`GRANT ${capability} TO ${login}`);
      }
      reviewer = newPool(reviewerLogin);
      if (options.sourceDiscoveryLogin === true) source = newPool(sourceLogin);
    },

    sourceDiscoveryPool() {
      if (source === null) throw new Error('setUp({ sourceDiscoveryLogin: true }) first');
      return source;
    },

    async tearDown(admin) {
      await Promise.all(pools.map((p) => p.end()));
      for (const login of logins) await admin.query(`DROP ROLE IF EXISTS ${login}`);
    },

    async confirmedSubject(readonly, name, website) {
      const subjectId = randomUUID();
      await registry([
        'propose',
        '--subject-id',
        subjectId,
        '--kind',
        'INDEPENDENT_COMMUNITY',
        '--name',
        name,
        ...sourceArgs(`p-${subjectId}`),
        '--execute',
      ]);
      await registry([
        'claim',
        '--subject-id',
        subjectId,
        '--claim-kind',
        'PUBLIC_WEBSITE',
        '--website-url',
        website,
        ...sourceArgs(`w-${subjectId}`),
        '--execute',
      ]);
      const client = await readonly.connect();
      let model;
      try {
        const graph = await loadSubjectGraph(client, subjectId, {
          asOf: await databaseNow(client),
        });
        model = deriveSubjectReadModel(graph!, trust);
      } finally {
        client.release();
      }
      const request: ReviewRequest = {
        target: { kind: 'SUBJECT', id: subjectId },
        outcome: 'CONFIRMED',
        expectedHeadReviewId: null,
        expectedStateDigest: model.stateDigest,
        reason: null,
      };
      const prepared = (await prepareReview(readonly, request, trust)).request;
      const verified = VerifiedReviewEnvelope.verify(
        Buffer.from(signIntent(prepared.intent, key), 'utf8'),
        trust,
      );
      await appendAttestedReview(
        reviewer!,
        TrustedReviewerContext.fromVerifiedEnvelope(verified),
        trust,
      );
      return { subjectId, websiteClaimId: model.websites[0]!.claimId };
    },

    async admit(admin, subjectId, rootClaimId, loadCohortRegistry) {
      const result = await recordSubjectResearchAdmission(
        admin,
        {
          subjectId,
          rootClaimId,
          actorKey: 'owner-cli',
          reason: `${tag} synthetic harness`,
          validitySeconds: VALIDITY,
        },
        { trust, loadCohortRegistry },
      );
      if (result.outcome !== 'ADMITTED') throw new Error(JSON.stringify(result.decision));
      return result.admissionId;
    },
  };
}
