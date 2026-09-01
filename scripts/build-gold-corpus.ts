#!/usr/bin/env node
/**
 * Regenerates the committed Phase 2B-2D1 gold-corpus fixture
 * `src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl` (plus its
 * one-line manifest) from the working database's frozen research evidence.
 *
 * DETERMINISTIC AND READ-ONLY. Every database statement is a SELECT (the
 * `classifier` role for evidence, the `readonly` role for run completions);
 * nothing is written except the two fixture files, and running this twice
 * against the same database state produces byte-identical output. It calls
 * no model and opens no socket beyond the local database pools.
 *
 * WHAT IT SELECTS. For every organisation with at least one COMPLETED,
 * non-dry research run, the LATEST such run (by started_at, then id), and
 * for that run the EXACT classifier handoff production assembly would
 * produce (`assembleClassifierHandoff` - same rank-8 eligibility, dedupe,
 * bounds and ordering). Selection, strata, split and hashing rules live in
 * `src/orgunits/classify/evaluation/` and are frozen by
 * `docs/evaluation/PHASE_2B_2D_GOLD_CORPUS_PROTOCOL.md`.
 *
 * Usage:
 *   node --env-file-if-exists=.env --import tsx scripts/build-gold-corpus.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../src/db/client.js';
import { assembleClassifierHandoff } from '../src/orgunits/classify/assemble.js';
import { MAX_CANDIDATES_PER_ROOT_TRACK } from '../src/orgunits/classify/constants.js';
import { canonicalStringify } from '../src/orgunits/classify/canonical.js';
import { loadEligibleRows } from '../src/orgunits/classify/loaders.js';
import { checkRunCompleted } from '../src/orgunits/classify/runStatus.js';
import { GoldCorpusItemSchema } from '../src/orgunits/classify/evaluation/goldSchema.js';
import { hashRecords } from '../src/orgunits/classify/evaluation/hashes.js';
import { ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION } from '../src/orgunits/classify/evaluation/protocol.js';
import {
  buildCorpusItems,
  type CandidateMeta,
  type OrganisationAssemblyInput,
  type PageMeta,
} from '../src/orgunits/classify/evaluation/select.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'src', 'test', 'fixtures', 'evaluation');
const CORPUS_OUT = resolve(OUT_DIR, 'orgunit-classifier-gold-v1.jsonl');
const MANIFEST_OUT = resolve(OUT_DIR, 'orgunit-classifier-gold-v1.manifest.jsonl');

interface EligibleRunRow {
  organisation_id: string;
  run_id: string;
}

async function main(): Promise<void> {
  const readonlyPool = createPool('readonly');
  const classifierPool = createPool('classifier');
  try {
    const { rows: runRows } = await readonlyPool.query<EligibleRunRow>(
      `SELECT DISTINCT ON (org.organisation_id)
              org.organisation_id, r.id AS run_id
         FROM orgunit_research_runs r
         JOIN orgunit_research_run_completions c
           ON c.run_id = r.id AND c.terminal_state = 'COMPLETED'
         JOIN LATERAL (
              SELECT DISTINCT organisation_id
                FROM orgunit_fetch_observations
               WHERE run_id = r.id AND organisation_id IS NOT NULL
         ) org ON TRUE
        WHERE r.dry_run = false
        ORDER BY org.organisation_id, r.started_at DESC, r.id DESC`,
    );

    const organisations: OrganisationAssemblyInput[] = [];
    for (const runRow of runRows) {
      const completion = await checkRunCompleted(readonlyPool, runRow.run_id);
      const assembly = await assembleClassifierHandoff(classifierPool, {
        organisationId: runRow.organisation_id,
        runId: runRow.run_id,
        runCompletion: completion,
      });
      if (assembly.kind === 'NO_CANDIDATES') {
        console.log(`  ${runRow.organisation_id} run ${runRow.run_id}: NO_CANDIDATES (skipped)`);
        continue;
      }

      const eligible = await loadEligibleRows(
        classifierPool,
        runRow.run_id,
        MAX_CANDIDATES_PER_ROOT_TRACK,
      );
      const pageMetaByEvidenceId = new Map<string, PageMeta>();
      for (const row of eligible) {
        const meta: CandidateMeta = {
          track: row.track,
          candidateScore: row.candidateScore,
          rankWithinRoot: row.rankWithinRoot,
          rootKey: row.rootKey,
        };
        const existing = pageMetaByEvidenceId.get(row.pageEvidenceId);
        if (existing === undefined) {
          pageMetaByEvidenceId.set(row.pageEvidenceId, {
            responseSha256: row.responseSha256,
            candidates: [meta],
          });
        } else {
          pageMetaByEvidenceId.set(row.pageEvidenceId, {
            responseSha256: existing.responseSha256,
            candidates: [...existing.candidates, meta],
          });
        }
      }

      const context = assembly.batches[0]?.batch.context;
      if (context === undefined) throw new Error(`Run ${runRow.run_id}: BATCHES with no batch.`);
      organisations.push({
        organisationId: runRow.organisation_id,
        echeRowKey: context.echeRowKey,
        organisationName: context.organisationName,
        countryCode: context.countryCode,
        runId: runRow.run_id,
        batches: assembly.batches,
        pageMetaByEvidenceId,
      });
      console.log(
        `  ${context.echeRowKey} (${context.organisationName}) run ${runRow.run_id}: ` +
          `${assembly.batches.length} batch(es), ${assembly.batches.reduce((n, b) => n + b.batch.documents.length, 0)} documents`,
      );
    }

    const { items, cappedOut } = buildCorpusItems(organisations);
    const validated = items.map((item) => GoldCorpusItemSchema.parse(item));

    const lines = validated.map((item) => canonicalStringify(item));
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(CORPUS_OUT, `${lines.join('\n')}\n`, { encoding: 'utf8' });

    const perOrganisation = new Map<string, number>();
    const perLanguage = new Map<string, number>();
    const perSplit = new Map<string, number>();
    for (const item of validated) {
      perOrganisation.set(item.echeRowKey, (perOrganisation.get(item.echeRowKey) ?? 0) + 1);
      perLanguage.set(item.strata.language, (perLanguage.get(item.strata.language) ?? 0) + 1);
      perSplit.set(item.split, (perSplit.get(item.split) ?? 0) + 1);
    }
    const sortedEntries = (map: Map<string, number>): Record<string, number> =>
      Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

    const manifest = {
      corpusVersion: ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION,
      itemCount: validated.length,
      corpusSha256: hashRecords(validated),
      perOrganisation: sortedEntries(perOrganisation),
      perLanguage: sortedEntries(perLanguage),
      perSplit: sortedEntries(perSplit),
      runIds: organisations
        .map((organisation) => ({ echeRowKey: organisation.echeRowKey, runId: organisation.runId }))
        .sort((a, b) => (a.echeRowKey < b.echeRowKey ? -1 : 1)),
      cappedOut: cappedOut.map((entry) => entry.goldId).sort(),
    };
    writeFileSync(MANIFEST_OUT, `${canonicalStringify(manifest)}\n`, { encoding: 'utf8' });

    console.log(`\nWrote ${validated.length} corpus items to ${CORPUS_OUT}`);
    console.log(`Corpus sha256: ${manifest.corpusSha256}`);
    console.log(`Per organisation: ${JSON.stringify(manifest.perOrganisation)}`);
    console.log(`Per language: ${JSON.stringify(manifest.perLanguage)}`);
    console.log(`Per split: ${JSON.stringify(manifest.perSplit)}`);
    if (cappedOut.length > 0) {
      console.log(`Capped out (${cappedOut.length}):`);
      for (const entry of cappedOut) console.log(`  ${entry.echeRowKey} ${entry.url}`);
    }
  } finally {
    await readonlyPool.end();
    await classifierPool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
