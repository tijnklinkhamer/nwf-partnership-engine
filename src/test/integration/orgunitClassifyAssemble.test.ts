/**
 * DB-BACKED CLASSIFIER HANDOFF ASSEMBLY: proves the pure pipeline wired to
 * real PostgreSQL, through the ACTUAL `nwf_classifier` role, produces the
 * approved contract - including the real Sorbonne (`?RH=`) and INSA
 * (dual-root) shapes, score-agnostic eligibility, and the run-completion
 * precondition this module cannot check itself (migration 0009 §17).
 *
 * `checkRunCompleted` is exercised through `readonlyPool()` - the role that
 * CAN read `orgunit_research_run_completions` - never `classifierPool()`.
 * `assembleClassifierHandoff` itself is exercised through
 * `classifierPool()` exclusively, proving the entire approved contract is
 * assemblable under the landed least-privilege grant with no broadening.
 *
 * They run against nwf_pe_test, never the working database.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  readonlyPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import { assembleClassifierHandoff } from '../../orgunits/classify/assemble.js';
import { checkRunCompleted } from '../../orgunits/classify/runStatus.js';
import {
  OrganisationRunMismatchError,
  RunNotCompletedError,
} from '../../orgunits/classify/errors.js';
import { MAX_CANDIDATES_PER_ROOT_TRACK } from '../../orgunits/classify/constants.js';
import type { AssemblyResult } from '../../orgunits/classify/types.js';

const describeDb = classifierDatabaseConfigured() ? describe : describe.skip;

function sha(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

interface SeededPage {
  readonly candidateId: string;
  readonly pageEvidenceId: string;
  readonly fetchObservationId: string;
}

describeDb('Phase 2B-2b classifier handoff assembly (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let readonly: pg.Pool;
  let root: OrgunitRootFixture;

  beforeAll(async () => {
    admin = adminPool();
    classifier = classifierPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);
  });

  afterAll(async () => {
    await Promise.all([admin.end(), classifier.end(), readonly.end()]);
  });

  async function seedRun(
    overrides: { ruleVersion?: string; fetchPolicyVersion?: string } = {},
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'test', $1, $2) RETURNING id`,
      [
        overrides.fetchPolicyVersion ?? 'orgunit-fetch-policy-v1',
        overrides.ruleVersion ?? 'orgunit-signal-rules-v1',
      ],
    );
    return rows[0]!.id;
  }

  async function completeRun(
    runId: string,
    terminalState: 'COMPLETED' | 'FAILED' | 'ABORTED' = 'COMPLETED',
  ): Promise<void> {
    await admin.query(
      `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at, error_kind)
       VALUES ($1, $2, now(), $3)`,
      [runId, terminalState, terminalState === 'COMPLETED' ? null : 'OTHER'],
    );
  }

  async function seedRootFetch(runId: string, url = 'https://www.example.ac.uk/'): Promise<string> {
    const { rows } = await admin.query<{ root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 'ROOT',
               200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING root_key`,
      [runId, root.websiteClaimId, root.echeRowKey, url],
    );
    return rows[0]!.root_key;
  }

  /** Seeds a promoted (non-claim) second root, returning its root_key. */
  async function seedPromotedRootFetch(runId: string, url: string): Promise<string> {
    const seedFetch = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          discovery_parent_url, http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/seed-for-promotion',
               'www.example.ac.uk', 'example.ac.uk', 'LINK',
               'https://www.example.ac.uk/', 301, 'ALLOWED',
               'orgunit-fetch-policy-v1', now())
       RETURNING id`,
      [runId, root.websiteClaimId, root.echeRowKey],
    );
    const redirect = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_redirect_observations
         (fetch_observation_id, http_status, to_url_raw, to_url_resolved,
          target_malformed, scheme_downgraded, host_changed,
          registrable_domain_changed, observed_at)
       VALUES ($1, 301, $2, $2, false, false, true, true, now())
       RETURNING id`,
      [seedFetch.rows[0]!.id, url],
    );
    const promotion = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_root_promotions
         (redirect_observation_id, redirect_target_malformed,
          redirect_scheme_downgraded, redirect_domain_changed,
          actor_key, approved_at)
       VALUES ($1, false, false, true, 'owner-cli', now())
       RETURNING id`,
      [redirect.rows[0]!.id],
    );
    const rootFetch = await admin.query<{ root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_promotion_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, 'www.promoted.edu', 'promoted.edu', 'ROOT',
               200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING root_key`,
      [runId, promotion.rows[0]!.id, root.echeRowKey, url],
    );
    return rootFetch.rows[0]!.root_key;
  }

  interface SeededFetchAndPage {
    readonly fetchObservationId: string;
    readonly pageEvidenceId: string;
    readonly rootKey: string;
  }

  /**
   * Seeds ONE fetch + ONE page evidence row for a URL - the real shape a
   * fetched page takes regardless of how many tracks later score it.
   * `seedCandidateFor` attaches one or more per-track candidate rows to the
   * SAME page evidence row, exactly as `scoreAndPersistCandidates` does for
   * a genuinely fetched page (one page, up to two candidate rows).
   */
  async function seedFetchAndPage(opts: {
    runId: string;
    rootKey: string;
    url: string;
    sha256: string;
    title?: string;
    mainText?: string;
  }): Promise<SeededFetchAndPage> {
    const hostname = new URL(opts.url).hostname;
    const labels = hostname.split('.');
    const registrableDomain = labels.slice(-2).join('.');
    const isClaim = opts.rootKey.startsWith('claim:');
    const claimId = isClaim ? opts.rootKey.slice('claim:'.length) : null;
    const promotionId = isClaim ? null : opts.rootKey.slice('promotion:'.length);

    const fetch = await admin.query<{ id: string; root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, root_promotion_id, eche_row_key,
          requested_url, requested_host, requested_registrable_domain,
          discovery_method, discovery_parent_url, http_status, content_type,
          charset, charset_source, charset_confidence, response_sha256,
          byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               'LINK', $9, 200, 'text/html', 'utf-8', 'HTTP_HEADER', 'DECLARED',
               $8, 4096, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING id, root_key`,
      [
        opts.runId,
        claimId,
        promotionId,
        root.echeRowKey,
        opts.url,
        hostname,
        registrableDomain,
        opts.sha256,
        `https://${hostname}/`,
      ],
    );
    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, title, declared_lang, headings,
          main_text, main_text_chars, extraction_method, rule_version, observed_at)
       VALUES ($1, $2, $3, 'en', '[]'::jsonb, $4, length($4), 'MAIN_ELEMENT',
               'orgunit-extraction-v1', now())
       RETURNING id`,
      [
        fetch.rows[0]!.id,
        fetch.rows[0]!.root_key,
        opts.title ?? 'Page Title',
        opts.mainText ?? 'Body text.',
      ],
    );
    return {
      fetchObservationId: fetch.rows[0]!.id,
      pageEvidenceId: page.rows[0]!.id,
      rootKey: fetch.rows[0]!.root_key,
    };
  }

  async function seedCandidateFor(
    fetchAndPage: SeededFetchAndPage,
    opts: {
      runId: string;
      track: 'INTERNATIONAL_OFFICE' | 'LANGUAGE_CENTRE';
      rank: number;
      score?: number;
      signals?: unknown[];
    },
  ): Promise<string> {
    const candidate = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_candidates
         (page_evidence_id, run_id, root_key, track, candidate_score,
          signals, rank_within_root, rule_version)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'orgunit-signal-rules-v1')
       RETURNING id`,
      [
        fetchAndPage.pageEvidenceId,
        opts.runId,
        fetchAndPage.rootKey,
        opts.track,
        opts.score ?? 9,
        JSON.stringify(opts.signals ?? [{ id: 'A_ERASMUS', kind: 'positive', field: 'urlPath' }]),
        opts.rank,
      ],
    );
    return candidate.rows[0]!.id;
  }

  /** Convenience: seeds one fetch + page + single candidate, the common single-track case. */
  async function seedPage(opts: {
    runId: string;
    rootKey: string;
    url: string;
    sha256: string;
    track: 'INTERNATIONAL_OFFICE' | 'LANGUAGE_CENTRE';
    rank: number;
    score?: number;
    title?: string;
    mainText?: string;
    signals?: unknown[];
  }): Promise<SeededPage> {
    const fetchAndPage = await seedFetchAndPage(opts);
    const candidateId = await seedCandidateFor(fetchAndPage, opts);
    return {
      candidateId,
      pageEvidenceId: fetchAndPage.pageEvidenceId,
      fetchObservationId: fetchAndPage.fetchObservationId,
    };
  }

  it('assembles a single-root, single-track handoff and computes a stable hash', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId);
    await completeRun(runId);
    await seedPage({
      runId,
      rootKey,
      url: 'https://www.example.ac.uk/international',
      sha256: sha('doc-1'),
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
    });

    const completion = await checkRunCompleted(readonly, runId);
    expect(completion.status).toBe('COMPLETED');

    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });

    expect(result.kind).toBe('BATCHES');
    if (result.kind !== 'BATCHES') throw new Error('unreachable');
    expect(result.batches).toHaveLength(1);
    const [batch] = result.batches;
    expect(batch!.batch.documents).toHaveLength(1);
    expect(batch!.batch.documents[0]!.url).toBe('https://www.example.ac.uk/international');
    expect(batch!.batch.documents[0]!.trackMembership).toEqual(['A']);
    expect(batch!.assemblyInputSha256).toMatch(/^[0-9a-f]{64}$/);

    // Re-running assembly against identical DB state is byte-identical.
    const again = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (again.kind !== 'BATCHES') throw new Error('unreachable');
    expect(again.batches[0]!.assemblyInputSha256).toBe(batch!.assemblyInputSha256);
  });

  it('assembles a single-root document eligible via BOTH tracks', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.bothtrack.fr/');
    await completeRun(runId);
    const url = 'https://www.bothtrack.fr/centre-langues-international';
    const contentSha = sha('both-track-doc');
    const fetchAndPage = await seedFetchAndPage({ runId, rootKey, url, sha256: contentSha });
    await seedCandidateFor(fetchAndPage, { runId, track: 'INTERNATIONAL_OFFICE', rank: 1 });
    await seedCandidateFor(fetchAndPage, { runId, track: 'LANGUAGE_CENTRE', rank: 1 });

    const completion = await checkRunCompleted(readonly, runId);
    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (result.kind !== 'BATCHES') throw new Error('expected BATCHES');
    expect(result.batches[0]!.batch.documents).toHaveLength(1);
    expect(result.batches[0]!.batch.documents[0]!.trackMembership).toEqual(['A', 'B']);
  });

  it('is score-agnostic: a rank-1 candidate with a NEGATIVE score is still eligible', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.negativescore.fr/');
    await completeRun(runId);
    await seedPage({
      runId,
      rootKey,
      url: 'https://www.negativescore.fr/login',
      sha256: sha('neg-score-doc'),
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
      score: -3,
      signals: [{ id: 'NEG_LOGIN_AUTH', kind: 'negative', field: 'urlPath' }],
    });

    const completion = await checkRunCompleted(readonly, runId);
    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (result.kind !== 'BATCHES')
      throw new Error('expected BATCHES, negative score must not be filtered');
    expect(result.batches[0]!.batch.documents).toHaveLength(1);
    expect(result.batches[0]!.batch.documents[0]!.url).toBe('https://www.negativescore.fr/login');
  });

  it('is score-agnostic: a rank-1 ZERO-score candidate is still eligible (the BTP CFA shape)', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.zeroscore.fr/');
    await completeRun(runId);
    await seedPage({
      runId,
      rootKey,
      url: 'https://www.zeroscore.fr/generic-page',
      sha256: sha('zero-score-doc'),
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
      score: 0,
      signals: [],
    });

    const completion = await checkRunCompleted(readonly, runId);
    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (result.kind !== 'BATCHES')
      throw new Error('expected BATCHES, zero score must not be filtered');
    expect(result.batches[0]!.batch.documents).toHaveLength(1);
  });

  it('excludes a candidate ranked beyond the top-8 cutoff', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.cutoff.fr/');
    await completeRun(runId);
    for (let rank = 1; rank <= MAX_CANDIDATES_PER_ROOT_TRACK + 1; rank += 1) {
      await seedPage({
        runId,
        rootKey,
        url: `https://www.cutoff.fr/page-${rank}`,
        sha256: sha(`cutoff-${rank}`),
        track: 'INTERNATIONAL_OFFICE',
        rank,
      });
    }

    const completion = await checkRunCompleted(readonly, runId);
    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (result.kind !== 'BATCHES') throw new Error('expected BATCHES');
    expect(result.batches[0]!.batch.documents).toHaveLength(MAX_CANDIDATES_PER_ROOT_TRACK);
    const urls = result.batches[0]!.batch.documents.map((d) => d.url);
    expect(urls).not.toContain(`https://www.cutoff.fr/page-${MAX_CANDIDATES_PER_ROOT_TRACK + 1}`);
  });

  it('the Sorbonne shape: three ?RH= URL variants sharing one response_sha256 collapse to one document, all subjects retained', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.sorbonne-nouvelle.fr/');
    await completeRun(runId);
    const sameContentSha = sha('sorbonne-lea-content');
    const variants = [
      { url: 'https://www.sorbonne-nouvelle.fr/k.jsp?RH=1', rank: 2 },
      { url: 'https://www.sorbonne-nouvelle.fr/k.jsp?RH=2', rank: 5 },
      { url: 'https://www.sorbonne-nouvelle.fr/k.jsp?RH=3', rank: 7 },
    ];
    const seeded: SeededPage[] = [];
    for (const variant of variants) {
      seeded.push(
        await seedPage({
          runId,
          rootKey,
          url: variant.url,
          sha256: sameContentSha,
          track: 'LANGUAGE_CENTRE',
          rank: variant.rank,
          title: 'LEA - Langues Etrangeres Appliquees',
        }),
      );
    }

    const completion = await checkRunCompleted(readonly, runId);
    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (result.kind !== 'BATCHES') throw new Error('expected BATCHES');
    const docs = result.batches[0]!.batch.documents;
    expect(docs).toHaveLength(1);
    // Representative = best rank (2), the other two are duplicateUrls.
    expect(docs[0]!.url).toBe('https://www.sorbonne-nouvelle.fr/k.jsp?RH=1');
    expect([...docs[0]!.duplicateUrls].sort()).toEqual(
      [
        'https://www.sorbonne-nouvelle.fr/k.jsp?RH=2',
        'https://www.sorbonne-nouvelle.fr/k.jsp?RH=3',
      ].sort(),
    );
    // All three original candidate subjects remain traceable for the
    // future orgunit_classification_subjects write.
    const subjects = [...result.batches[0]!.subjectsByDocIndex.values()][0]!;
    expect([...subjects].sort()).toEqual(seeded.map((s) => s.candidateId).sort());
  });

  it('the INSA shape: identical content reached via two independent roots preserves both roots', async () => {
    const runId = await seedRun();
    const rootKeyClaim = await seedRootFetch(runId, 'https://www.insa-rouen.fr/');
    const rootKeyPromotion = await seedPromotedRootFetch(runId, 'https://www.insa-rouen.fr/');
    await completeRun(runId);
    const sharedSha = sha('insa-international-content');
    const first = await seedPage({
      runId,
      rootKey: rootKeyClaim,
      url: 'https://www.insa-rouen.fr/international',
      sha256: sharedSha,
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
    });
    const second = await seedPage({
      runId,
      rootKey: rootKeyPromotion,
      url: 'https://www.insa-rouen.fr/international',
      sha256: sharedSha,
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
    });

    const completion = await checkRunCompleted(readonly, runId);
    const result = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    if (result.kind !== 'BATCHES') throw new Error('expected BATCHES');
    const docs = result.batches[0]!.batch.documents;
    expect(docs).toHaveLength(1);
    expect(docs[0]!.roots.map((r) => r.rootKey).sort()).toEqual(
      [rootKeyClaim, rootKeyPromotion].sort(),
    );
    const subjects = [...result.batches[0]!.subjectsByDocIndex.values()][0]!;
    expect([...subjects].sort()).toEqual([first.candidateId, second.candidateId].sort());
  });

  it('reports NO_CANDIDATES for a completed run with zero eligible candidates', async () => {
    const runId = await seedRun();
    await seedRootFetch(runId, 'https://www.nothingfound.fr/');
    await completeRun(runId);

    const completion = await checkRunCompleted(readonly, runId);
    const result: AssemblyResult = await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    expect(result.kind).toBe('NO_CANDIDATES');
  });

  it('refuses a run with no completion recorded', async () => {
    const runId = await seedRun();
    await seedRootFetch(runId, 'https://www.notyet.fr/');
    // No completeRun() call.

    const completion = await checkRunCompleted(readonly, runId);
    expect(completion.status).toBe('NO_COMPLETION_RECORDED');
    await expect(
      assembleClassifierHandoff(classifier, {
        organisationId: root.organisationId,
        runId,
        runCompletion: completion,
      }),
    ).rejects.toThrow(RunNotCompletedError);
  });

  it('refuses a FAILED run', async () => {
    const runId = await seedRun();
    await seedRootFetch(runId, 'https://www.failedrun.fr/');
    await completeRun(runId, 'FAILED');

    const completion = await checkRunCompleted(readonly, runId);
    expect(completion.status).toBe('FAILED');
    await expect(
      assembleClassifierHandoff(classifier, {
        organisationId: root.organisationId,
        runId,
        runCompletion: completion,
      }),
    ).rejects.toThrow(RunNotCompletedError);
  });

  it('refuses an organisation/run mismatch', async () => {
    // A second, genuinely different organisation.
    const otherOrg = await admin.query<{ id: string }>(
      `INSERT INTO organisations (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ('Y OTHER01|888000222', 'Other Institution', 'Other Institution', 'FR', 'Y OTHER01', '888000222')
       RETURNING id`,
    );

    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.mismatch.fr/');
    await completeRun(runId);
    await seedPage({
      runId,
      rootKey,
      url: 'https://www.mismatch.fr/international',
      sha256: sha('mismatch-doc'),
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
    });

    const completion = await checkRunCompleted(readonly, runId);
    await expect(
      assembleClassifierHandoff(classifier, {
        organisationId: otherOrg.rows[0]!.id,
        runId,
        runCompletion: completion,
      }),
    ).rejects.toThrow(OrganisationRunMismatchError);
  });

  it('performs zero writes: DB row counts are unchanged after assembly', async () => {
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, 'https://www.readonlycheck.fr/');
    await completeRun(runId);
    await seedPage({
      runId,
      rootKey,
      url: 'https://www.readonlycheck.fr/international',
      sha256: sha('readonly-check-doc'),
      track: 'INTERNATIONAL_OFFICE',
      rank: 1,
    });

    const countsBefore = await tableCounts(admin);
    const completion = await checkRunCompleted(readonly, runId);
    await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    await assembleClassifierHandoff(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: completion,
    });
    const countsAfter = await tableCounts(admin);
    expect(countsAfter).toEqual(countsBefore);
  });

  async function tableCounts(pool: pg.Pool): Promise<Record<string, number>> {
    const tables = [
      'orgunit_classifier_calls',
      'orgunit_classifier_call_completions',
      'orgunit_page_classifications',
      'orgunit_classification_subjects',
      'orgunit_page_candidates',
      'orgunit_page_evidence',
      'orgunit_fetch_observations',
    ];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
      counts[table] = Number.parseInt(rows[0]!.n, 10);
    }
    return counts;
  }
});
