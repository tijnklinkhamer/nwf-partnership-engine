/**
 * WW ACCEPTANCE (directive §7 scenarios 1–4, 10's queue half, 12's Engine half): ONE autonomous,
 * OWNER-signed acquisition campaign over a fictitious worldwide web, through the REAL wired
 * pipeline on a disposable database:
 *
 *   three OWNER-path search grants (NL, MX, JP) → the gated fake WebSearch (one search per call,
 *   reported as the bundled executable does) → nominations → dedupe (an ECHE duplicate refused by
 *   name, a large university tagged and deprioritised, never dropped) → campaign research
 *   admission → bounded research through the gateway (scripted transport; robots honoured) →
 *   link-outs to organisations in BRAZIL, GERMANY and KENYA researched as their own subjects →
 *   Engine export v2 (rules v3: listed dates OBSERVED, statements proposed, contact data withheld)
 *   → the batched OWNER identity review with each country stated from the organisation's OWN page
 *   (`review sign --country`) → the acquisition outbox the Operator reads.
 *
 * Six markets, four scripts/languages (Latin nl/es/pt/de/en and Japanese). The geographies are
 * regression cases, not limits: nothing here maps a country to a score or infers a country. Every
 * organisation is fictitious (`-fict` names, scripted transport), every key a TEST-ONLY in-memory pair, the
 * search a scripted fake (no network). With WW_ACCEPTANCE_WRITE_FIXTURE=<dir> the campaign's
 * outbox is copied there for the Operator walkthrough (byte-for-byte, pinned on that side).
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import {
  recordCampaign,
  recordControlEvent,
  runWorker,
  WORKER_STAGES,
} from '../../orgunits/acquisition/index.js';
import {
  OUTBOX_EXPORT_V2_FILE,
  OUTBOX_MANIFEST_FILE,
  OUTBOX_SUBJECT_FACTS_FILE,
  createStageHandlers,
  loadAcquisitionStatusV1,
  type OutboxManifestLine,
} from '../../orgunits/acquisitionWiring/index.js';
import { signedCampaign } from '../helpers/acquisitionCampaignFixtures.js';
import {
  createWiringHarness,
  truncateWiring,
  type WiringHarness,
} from '../helpers/acquisitionWiringHarness.js';
import {
  PII,
  SITE,
  STATED_COUNTRY,
  worldSdk,
  worldTransport,
} from '../helpers/wwAcceptanceWorld.js';
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20, leaseSeconds: 120 } as const;

/** The parts of `nwf-pe.qualification-input-export.v2` this acceptance reads. */
interface ExportDoc {
  readonly country: { readonly value: string | null; readonly standing: string };
  readonly claims: readonly { readonly mode: string; readonly claimKey: string }[];
  readonly proposals: readonly {
    readonly key: string;
    readonly proposedValue: { readonly languages?: readonly string[] };
  }[];
  readonly researchStatus: readonly { readonly status: string }[];
}

describeDb('WW acceptance: autonomous worldwide discovery to the outbox (integration)', () => {
  let h: WiringHarness;
  let campaignId: string;
  const statedBySubject = new Map<string, string>();
  const transport = worldTransport();
  const sdk = worldSdk();

  beforeAll(async () => {
    h = await createWiringHarness('wwacc');
    await truncateWiring(h.admin);
    await h.echeClaim('eche-dup-fict.jp');
    await h.verifySmokeRuntime();
    const grants = [await h.grant('NL'), await h.grant('MX'), await h.grant('JP')];
    const text = signedCampaign(h.campaignKey, {
      environmentId: h.environmentId,
      geographies: ['JP', 'MX', 'NL'],
      sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
      stages: [...WORKER_STAGES],
      searchGrantIds: grants,
      budgets: { maxConcurrency: '1' },
    });
    const recorded = await recordCampaign(
      h.admin,
      Buffer.from(text),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    campaignId = recorded.campaignId;
    await recordControlEvent(
      h.admin,
      { campaignId, action: 'START', actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
  }, 120_000);
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });

  const work = () =>
    runWorker({
      pool: h.worker,
      campaignId,
      workerId: 'ww-acceptance-worker',
      handlers: createStageHandlers(h.deps(sdk, transport)),
      trust: h.campaignTrust,
      ...FAST,
    });
  const subjectDir = (subjectId: string) => join(h.outboxDir, campaignId, 'subjects', subjectId);
  const exportOf = (subjectId: string) =>
    JSON.parse(
      readFileSync(join(subjectDir(subjectId), OUTBOX_EXPORT_V2_FILE), 'utf8'),
    ) as ExportDoc;

  interface ListedSubject {
    subjectId: string;
    rootUrl: string;
    stateDigest: string;
    countryMentions: { countries: string[]; pageEvidenceId: string; line: string }[];
  }
  async function listSubjects(): Promise<ListedSubject[]> {
    const listed: string[] = [];
    expect(
      await runAcquisitionCli(['review', 'list', '--campaign-id', campaignId, '--json'], {
        readonlyPool: h.poolFactory('readonly'),
        reviewTrust: h.reviewTrust,
        out: (t) => void listed.push(t),
      }),
    ).toBe(0);
    return (JSON.parse(listed.join('')) as { subjects: ListedSubject[] }).subjects;
  }

  it('1 · the worker discovers, deduplicates and researches the world without per-organisation commands', async () => {
    const run = await work();
    expect(run.stopReason).toBe('QUEUE_DRAINED');
    // One gated search per grant (hook + canUseTool), nothing pre-approved.
    expect(sdk.calls()).toBe(3);
    expect(sdk.decisions.filter((d) => d === 'canUseTool:WebSearch:allow')).toHaveLength(3);
    // The ECHE duplicate is refused by name and never fetched.
    expect(transport.resolvedHosts).not.toContain('www.eche-dup-fict.jp');
    // Seven organisations researched: three found by search, the university (deprioritised, not
    // dropped) and three link-outs in BR, DE and KE that no seed or register names.
    const researched = new Set(
      transport.requestedUrls
        .filter((u) => !u.endsWith('robots.txt'))
        .map((u) => `${new URL(u).origin}/`),
    );
    for (const site of [SITE.nl, SITE.mx, SITE.jp, SITE.university, SITE.br, SITE.de, SITE.ke]) {
      expect(researched, site).toContain(site);
    }
    const status = await loadAcquisitionStatusV1(h.readonly, campaignId, h.campaignTrust);
    expect(status).toMatchObject({
      campaign: { controlState: 'RUNNING', verified: true },
      candidates: { duplicatesRefused: 1, largeHeiDeprioritised: 1, researched: 7 },
      identityReview: { awaiting: 7 },
      outbox: { researchExports: 7, manifestEntries: 0 },
    });
  });

  it('2 · research yields source-backed C1 evidence per language; contact data never leaves; sparse stays unknown', async () => {
    const subjects = readdirSync(join(h.outboxDir, campaignId, 'subjects'));
    expect(subjects).toHaveLength(7);
    const bySite = new Map((await listSubjects()).map((x) => [x.rootUrl, x.subjectId]));
    for (const subjectId of subjects) {
      const text = readFileSync(join(subjectDir(subjectId), OUTBOX_EXPORT_V2_FILE), 'utf8');
      const facts = readFileSync(join(subjectDir(subjectId), OUTBOX_SUBJECT_FACTS_FILE), 'utf8');
      for (const leaked of PII) {
        expect(text, `${subjectId} export`).not.toContain(leaked);
        expect(facts, `${subjectId} facts`).not.toContain(leaked);
      }
    }
    // NL: LISTED welcome-week dates are observed; the self-description is a proposal.
    const nl = exportOf(bySite.get(SITE.nl)!);
    const observedKeys = nl.claims.filter((c) => c.mode === 'OBSERVED').map((c) => c.claimKey);
    expect(observedKeys).toEqual(expect.arrayContaining(['channel.event_instances']));
    const languagesOf = (doc: ExportDoc) =>
      doc.proposals
        .filter((p) => p.key === 'audience.languages')
        .flatMap((p) => p.proposedValue.languages ?? []);
    expect(languagesOf(nl)).toContain('nl');
    expect(languagesOf(exportOf(bySite.get(SITE.mx)!))).toContain('es');
    expect(languagesOf(exportOf(bySite.get(SITE.br)!))).toContain('pt');
    expect(languagesOf(exportOf(bySite.get(SITE.de)!))).toContain('de');
    expect(languagesOf(exportOf(bySite.get(SITE.jp)!))).toContain('ja');
    // The university page says almost nothing: its subcriteria stay unresolved gaps.
    const uni = exportOf(bySite.get(SITE.university)!);
    const unresolved = uni.researchStatus.filter((r) => r.status !== 'EVIDENCE_FOUND');
    expect(unresolved.length).toBeGreaterThanOrEqual(8);
    // Country is never inferred: before the OWNER states it, every export says null.
    for (const subjectId of subjects) expect(exportOf(subjectId).country.value).toBeNull();
  });

  it("3 · batched OWNER identity review: each country stated from the organisation's own page; one subject left unreviewed", async () => {
    const list = { subjects: await listSubjects() };
    const expected = STATED_COUNTRY;
    const args: string[] = ['review', 'sign', '--campaign-id', campaignId];
    const signed: string[] = [];
    for (const s of list.subjects) {
      const country = expected[s.rootUrl];
      if (country === undefined) continue; // the university stays unreviewed
      const mention = s.countryMentions.find((m) => m.countries.includes(country));
      expect(mention, `${s.rootUrl} names ${country} on its own page`).toBeDefined();
      args.push('--subject-id', s.subjectId, '--expect', `${s.subjectId}=${s.stateDigest}`);
      // The CLI's `<subjectId>=<CC>@<pageEvidenceId>` syntax (a page citation, not an address).
      args.push('--country', `${s.subjectId}=${country}` + `@${mention!.pageEvidenceId}`);
      signed.push(s.subjectId);
      statedBySubject.set(s.subjectId, country);
    }
    expect(signed).toHaveLength(6);
    args.push('--key-file', h.reviewKeyFile, '--key-id', h.reviewKey.keyId, '--execute', '--json');
    const out: string[] = [];
    let prompts = 0;
    const exit = await runAcquisitionCli(args, {
      readonlyPool: h.poolFactory('readonly'),
      reviewerPool: h.poolFactory('reviewer'),
      ownerPool: h.poolFactory('admin'),
      writerPool: h.poolFactory('writer'),
      reviewTrust: h.reviewTrust,
      passphrase: () => {
        prompts += 1;
        return Promise.resolve(Buffer.from(h.reviewPassphrase, 'utf8'));
      },
      out: (t) => void out.push(t),
      err: (t) => void out.push(t),
    });
    expect(exit, out.join('')).toBe(0);
    expect(prompts).toBe(1);
  });

  it('4 · the worker writes the outbox manifest for exactly the reviewed subjects, with stated countries', async () => {
    const run = await work();
    expect(run.stopReason).toBe('QUEUE_DRAINED');
    expect(sdk.calls()).toBe(3); // no new search
    const manifest = readFileSync(join(h.outboxDir, campaignId, OUTBOX_MANIFEST_FILE), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as OutboxManifestLine);
    expect(manifest).toHaveLength(6);
    const { rows: researchRows } = await h.admin.query<{ subject_id: string; sha: string }>(
      `SELECT subject_id, export_v2_sha256 AS sha FROM acquisition_outbox_entries
        WHERE campaign_id = $1 AND entry_kind = 'RESEARCH_EXPORT'`,
      [campaignId],
    );
    for (const line of manifest) {
      expect(line.identityReview).toBe('OWNER_SIGNED_REVIEW_APPENDED');
      // The manifest names the pair RE-DERIVED after the OWNER review: it carries the stated
      // country (the pre-review pair said null), and the file on disk is exactly that pair.
      const doc = exportOf(line.subjectId);
      expect(doc.country).toMatchObject({
        value: statedBySubject.get(line.subjectId),
        standing: 'STATED',
        notRankableReason: null,
      });
      const bytes = readFileSync(
        join(h.outboxDir, campaignId, line.files.qualificationInputExportV2.path),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        line.files.qualificationInputExportV2.sha256,
      );
      const research = researchRows.find((r) => r.subject_id === line.subjectId)!;
      expect(research.sha).not.toBe(line.files.qualificationInputExportV2.sha256);
    }
    // A running worker cannot write the pair before the claim: every claim precedes its
    // subject's release (the ASSESSABLE item), which `review sign` performs last.
    const { rows: order } = await h.admin.query<{ ok: boolean }>(
      `SELECT bool_and(c.created_at < i.created_at) AS ok
         FROM subject_jurisdiction_claims c
         JOIN acquisition_work_items i ON i.subject_id = c.subject_id AND i.stage = 'ASSESSABLE'
        WHERE i.campaign_id = $1`,
      [campaignId],
    );
    expect(order[0]!.ok).toBe(true);
    expect(new Set(manifest.map((l) => statedBySubject.get(l.subjectId)))).toEqual(
      new Set(['NL', 'MX', 'JP', 'BR', 'DE', 'KE']),
    );
    const status = await loadAcquisitionStatusV1(h.readonly, campaignId, h.campaignTrust);
    expect(status).toMatchObject({
      identityReview: { awaiting: 1, released: 6 },
      outbox: { manifestEntries: 6 },
    });
    const target = process.env.WW_ACCEPTANCE_WRITE_FIXTURE;
    if (target) {
      cpSync(join(h.outboxDir, campaignId), join(target, campaignId), { recursive: true });
      expect(existsSync(join(target, campaignId, OUTBOX_MANIFEST_FILE))).toBe(true);
    }
  });
});
