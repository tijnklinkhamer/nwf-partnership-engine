/**
 * A1 FRAME MATERIALISATION — the entry point.
 *
 *   npx tsx src/test/harness/phase2b2d2c/corpus/materialiseFrame.ts [--write]
 *
 * Without `--write` it computes everything and writes nothing, so the frame can
 * be inspected before it is committed. With `--write` it writes exactly one
 * file: the frame artifact.
 *
 * IT VERIFIES THE DATABASE BEFORE AND AFTER
 *
 *   A1 is bound to the post-A0 state. Before reading, every expected count and
 *   the source identity of both ingest runs are checked; a deviation is a STOP,
 *   because materialising from a different snapshot would produce a frame that
 *   silently describes something else. After writing, every count is read
 *   again and required to be unchanged - the proof that a read-only step was
 *   read-only comes from the database, not from the absence of an INSERT in
 *   the source.
 *
 * IT DOES NOT RANK ANYTHING. No sha256 of an eche_row_key, no first 110, no
 * next 40, no selection index, no split assignment, no DRAW artifact. That is
 * A1b and it is not authorised.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPool } from '../../../../db/client.js';
import {
  A0_ECHE_ARTIFACT_BYTES,
  A0_ECHE_ARTIFACT_SHA256,
  A0_SOURCE_MANIFEST_BYTES,
  A0_SOURCE_MANIFEST_SHA256,
  DATABASE_SCHEMA_VERSION_RANGE,
  FRAME_ARTIFACT_PATH,
  GENERATION_ID,
  type FrameEntry,
} from './frameContract.js';
import { hashClaimEligibilitySnapshot, hashPromotionEligibilitySnapshot } from './claimSnapshot.js';
import { enumerateFrame, reconcileCounts } from './frameEnumeration.js';
import {
  buildFrameArtifact,
  recomputeFrameHash,
  renderFrameArtifact,
  type FrameArtifact,
} from './frameArtifact.js';
import { readHistoricalDevelopmentExclusion } from './historicalExclusion.js';
import { readPriorGenerationExclusion } from './priorGenerationExclusion.js';
import { readFrameInputs, readTableCounts, type FrameInputs } from './readFrameInputs.js';

/** SD2 needs 110 selection + 40 reserve. Below this, A1b cannot proceed. */
export const A1B_MINIMUM_ELIGIBLE_ORGANISATIONS = 150;

/** The exact post-A0 state A1 is authorised against. */
export const EXPECTED_POST_A0_TABLE_COUNTS: Readonly<Record<string, number>> = {
  organisations: 6139,
  organisation_sources: 6139,
  ingest_runs: 2,
  website_claims: 6139,
  website_source_snapshots: 0,
  ewp_snapshots: 0,
  ewp_heis: 0,
  ewp_hosts: 0,
  ewp_hei_other_ids: 0,
  ewp_api_declarations: 0,
  ewp_host_covered_heis: 0,
  orgunit_research_runs: 0,
  orgunit_research_run_completions: 0,
  orgunit_fetch_observations: 0,
  orgunit_redirect_observations: 0,
  orgunit_root_promotions: 0,
  orgunit_root_promotion_revocations: 0,
  orgunit_page_evidence: 0,
  orgunit_page_candidates: 0,
  orgunit_classifier_calls: 0,
  orgunit_classifier_call_completions: 0,
  orgunit_page_classifications: 0,
  orgunit_classification_subjects: 0,
};

export const EXPECTED_STRUCTURALLY_VALID_CLAIMS = 5832;

export class FrameMaterialisationStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameMaterialisationStop';
  }
}

/** Throws unless the database is exactly the post-A0 snapshot A1 is bound to. */
export function verifyPostA0State(inputs: FrameInputs): void {
  const actual = new Map(inputs.tableCounts.map((row) => [row.table, row.count]));
  for (const [table, expected] of Object.entries(EXPECTED_POST_A0_TABLE_COUNTS)) {
    const observed = actual.get(table);
    if (observed !== expected) {
      throw new FrameMaterialisationStop(
        `STOP: ${table} holds ${observed} rows, expected ${expected}. A1 is bound to the ` +
          `post-A0 state and will not materialise from a different snapshot.`,
      );
    }
  }

  const structurallyValid = inputs.claimRows.filter(
    (row) => row.structural_status === 'STRUCTURALLY_VALID',
  ).length;
  if (structurallyValid !== EXPECTED_STRUCTURALLY_VALID_CLAIMS) {
    throw new FrameMaterialisationStop(
      `STOP: ${structurallyValid} STRUCTURALLY_VALID claims, expected ` +
        `${EXPECTED_STRUCTURALLY_VALID_CLAIMS}.`,
    );
  }

  if (inputs.ingestRuns.length !== 2) {
    throw new FrameMaterialisationStop(
      `STOP: ${inputs.ingestRuns.length} ingest runs, expected exactly 2.`,
    );
  }
  for (const run of inputs.ingestRuns) {
    if (run.sourceFileSha256 !== A0_ECHE_ARTIFACT_SHA256) {
      throw new FrameMaterialisationStop(
        `STOP: ingest run ${run.id} (${run.sourceSystem}) refers to artifact ` +
          `${run.sourceFileSha256}, not the A0 ECHE artifact ${A0_ECHE_ARTIFACT_SHA256}.`,
      );
    }
    if (run.status !== 'succeeded') {
      throw new FrameMaterialisationStop(
        `STOP: ingest run ${run.id} has status ${run.status}, expected succeeded.`,
      );
    }
  }

  for (const claim of inputs.claimRows) {
    if (claim.source_artifact_sha256 !== A0_ECHE_ARTIFACT_SHA256) {
      throw new FrameMaterialisationStop(
        `STOP: claim ${claim.id} was read from artifact ${claim.source_artifact_sha256}, ` +
          `not the A0 ECHE artifact.`,
      );
    }
  }
}

/** Counts authorities by type, plus the shape of the per-organisation counts. */
export function rootAuthorityDistribution(
  entries: readonly FrameEntry[],
): Readonly<Record<string, number>> {
  let zero = 0;
  let one = 0;
  let many = 0;
  let total = 0;
  let claims = 0;
  let promotions = 0;
  for (const entry of entries) {
    total += entry.rootAuthorityCount;
    if (entry.rootAuthorityCount === 0) zero += 1;
    else if (entry.rootAuthorityCount === 1) one += 1;
    else many += 1;
    for (const authority of entry.rootAuthorities) {
      if (authority.startsWith('WEBSITE_CLAIM:')) claims += 1;
      else promotions += 1;
    }
  }
  return {
    organisationsWithZeroAuthorities: zero,
    organisationsWithExactlyOneAuthority: one,
    organisationsWithMoreThanOneAuthority: many,
    totalRootAuthorities: total,
    totalWebsiteClaimAuthorities: claims,
    totalRootPromotionAuthorities: promotions,
  };
}

export interface MaterialisationResult {
  readonly artifact: FrameArtifact;
  readonly bytes: string;
  readonly artifactFileSha256: string;
  readonly written: boolean;
  readonly artifactPath: string;
  readonly sufficientForA1b: boolean;
  readonly tableCountsBefore: readonly { table: string; count: number }[];
  readonly tableCountsAfter: readonly { table: string; count: number }[];
}

/** Builds the artifact from already-read inputs. Performs no IO of its own. */
export function buildFrameFromInputs(repoRoot: string, inputs: FrameInputs): FrameArtifact {
  verifyPostA0State(inputs);

  const historical = readHistoricalDevelopmentExclusion(repoRoot);
  const prior = readPriorGenerationExclusion(repoRoot, GENERATION_ID);

  const { entries, counts } = enumerateFrame({
    organisations: inputs.organisations,
    historicalDevelopmentEcheRowKeys: historical.echeRowKeys,
    priorGenerationEcheRowKeys: prior.echeRowKeys,
  });
  reconcileCounts(entries, counts);

  return buildFrameArtifact({
    provenance: {
      generationId: GENERATION_ID,
      examinedPopulationDefinition:
        'every row of the organisations table, which after A0 is exactly the 6,139 ECHE source ' +
        'rows of artifact 32e1de18, one per eche_row_key',
      historicalDevelopmentSourcePath: historical.sourcePath,
      historicalDevelopmentItemCount: historical.itemCount,
      historicalDevelopmentOrganisationIds: historical.historicalOrganisationIds,
      priorGenerationIds: prior.priorGenerationIds,
      priorGenerationArtifacts: prior.scannedArtifacts,
    },
    sourceIdentity: {
      echeArtifactSha256: A0_ECHE_ARTIFACT_SHA256,
      echeArtifactBytes: A0_ECHE_ARTIFACT_BYTES,
      sourceManifestSha256: A0_SOURCE_MANIFEST_SHA256,
      sourceManifestBytes: A0_SOURCE_MANIFEST_BYTES,
      ingestRunIds: inputs.ingestRuns.map((run) => run.id),
      claimSnapshotSha256: hashClaimEligibilitySnapshot(inputs.claimRows),
      promotionSnapshotSha256: hashPromotionEligibilitySnapshot(inputs.promotionRows),
      claimRuleVersion: inputs.claimRuleVersions.join(','),
      claimSourceKind: inputs.claimSourceKinds.join(','),
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION_RANGE,
    },
    counts,
    entries,
    rootAuthorityDistribution: rootAuthorityDistribution(entries),
  });
}

/** The whole A1 step: verify, read, enumerate, write once, verify again. */
export async function materialiseFrame(
  repoRoot: string,
  options: { write: boolean },
): Promise<MaterialisationResult> {
  return withPool('readonly', async (pool) => {
    const inputs = await readFrameInputs(pool);
    const artifact = buildFrameFromInputs(repoRoot, inputs);
    const bytes = await renderFrameArtifact(artifact);
    const artifactPath = join(repoRoot, FRAME_ARTIFACT_PATH);

    if (options.write) {
      mkdirSync(dirname(artifactPath), { recursive: true });
      writeFileSync(artifactPath, bytes, 'utf8');

      // Reread, reparse, recompute, require equality - never trust the value
      // still held in memory.
      const reread = readFileSync(artifactPath, 'utf8');
      if (reread !== bytes) {
        throw new FrameMaterialisationStop(
          'STOP: the artifact on disk differs from what was written.',
        );
      }
      const reparsed = JSON.parse(reread) as FrameArtifact;
      const recomputed = recomputeFrameHash(reparsed);
      if (recomputed !== reparsed.frameHash) {
        throw new FrameMaterialisationStop(
          `STOP: recomputed frameHash ${recomputed} does not equal the stored ` +
            `${reparsed.frameHash}.`,
        );
      }
      if (recomputed !== artifact.frameHash) {
        throw new FrameMaterialisationStop('STOP: the round-tripped frameHash moved.');
      }
      reconcileCounts(reparsed.entries, reparsed.counts);
    }

    const tableCountsAfter = await readTableCounts(pool);
    for (const after of tableCountsAfter) {
      const before = inputs.tableCounts.find((row) => row.table === after.table);
      if (!before || before.count !== after.count) {
        throw new FrameMaterialisationStop(
          `DATABASE DELTA: ${after.table} moved from ${before?.count} to ${after.count}. ` +
            `A1 is read-only; this is a violation, not a result.`,
        );
      }
    }

    return {
      artifact,
      bytes,
      artifactFileSha256: createHash('sha256').update(bytes, 'utf8').digest('hex'),
      written: options.write,
      artifactPath: FRAME_ARTIFACT_PATH,
      sufficientForA1b:
        artifact.counts.eligibleOrganisationCount >= A1B_MINIMUM_ELIGIBLE_ORGANISATIONS,
      tableCountsBefore: inputs.tableCounts.map((row) => ({ ...row })),
      tableCountsAfter: tableCountsAfter.map((row) => ({ ...row })),
    };
  });
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
  const write = process.argv.includes('--write');
  const result = await materialiseFrame(repoRoot, { write });
  const { counts } = result.artifact;

  console.log(`generationId               ${result.artifact.generationId}`);
  console.log(`examinedOrganisationCount  ${counts.examinedOrganisationCount}`);
  console.log(`eligibleOrganisationCount  ${counts.eligibleOrganisationCount}`);
  console.log(`excludedOrganisationCount  ${counts.excludedOrganisationCount}`);
  console.log(`  historical DEVELOPMENT   ${counts.excludedHistoricalDevelopmentCount}`);
  console.log(`  prior generation         ${counts.excludedPriorGenerationCount}`);
  console.log(`  no valid root authority  ${counts.noValidAuthorityCount}`);
  console.log(
    `rootAuthorityDistribution  ${JSON.stringify(result.artifact.rootAuthorityDistribution)}`,
  );
  console.log(`claimSnapshotSha256        ${result.artifact.sourceIdentity.claimSnapshotSha256}`);
  console.log(
    `promotionSnapshotSha256    ${result.artifact.sourceIdentity.promotionSnapshotSha256}`,
  );
  console.log(`frameHash                  ${result.artifact.frameHash}`);
  console.log(`artifactFileSha256         ${result.artifactFileSha256}`);
  console.log(`artifactBytes              ${Buffer.byteLength(result.bytes, 'utf8')}`);
  console.log(`written                    ${result.written} (${result.artifactPath})`);
  console.log(
    result.sufficientForA1b
      ? 'PHASE_2B_2D_A1_FRAME_COMPLETE_AWAITING_A1B_AUTHORISATION'
      : 'A1_FRAME_INSUFFICIENT_FOR_110_PLUS_40',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
