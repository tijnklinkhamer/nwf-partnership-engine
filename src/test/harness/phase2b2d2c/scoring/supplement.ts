/**
 * PHASE 2B-2D2C-F4A — LOADING THE SCORING-ONLY GOLD SUPPLEMENT.
 *
 * F4 closed BLOCKED because no DEVELOPMENT-only source carried a gold label.
 * This is the one way that can change, and it is deliberately NOT the F0B
 * freeze: adding a label path to the freeze would mint a new freeze hash and
 * make attempt 1 appear to have run under a configuration carrying gold.
 * Instead the supplement is a SEPARATE, post-inference document that the
 * scorer may read and the runner may not.
 *
 * IT FAILS CLOSED ON EVERY MISMATCH, and each check answers a specific way a
 * gold set could quietly stop describing this run:
 *
 *   status                  a supplement still awaiting authorised projection
 *                           carries null hashes and is refused outright.
 *   parent freeze hash      the supplement names the freeze it was built
 *                           against; a disagreement means the labels and the
 *                           run no longer share a configuration.
 *   attempt aggregate       the supplement names the preserved attempt; a
 *                           disagreement means these labels were prepared
 *                           for different evidence.
 *   fixture hash            the labels on disk must be the labels the
 *                           supplement committed to. An edited fixture is
 *                           refused, which is what makes "no gold label was
 *                           changed" checkable rather than asserted.
 *   id set equality         the label ids must equal the canonical
 *                           DEVELOPMENT corpus ids EXACTLY — no missing item
 *                           (which would silently shrink a denominator), and
 *                           no extra item (which could only have come from
 *                           outside the DEVELOPMENT split).
 *
 * Absence is not an error: a scoring run given no supplement path scores
 * exactly as F4 did, with no gold and no semantic denominator.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AdjudicationItemSchema,
  type ProposedLabel,
} from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { sha256Hex } from '../freeze.js';

export class ScoringSupplementError extends Error {
  override readonly name = 'ScoringSupplementError';
}

function fail(message: string): never {
  throw new ScoringSupplementError(message);
}

export interface LoadedGoldSupplement {
  readonly supplementPath: string;
  readonly supplementRawSha256: string;
  readonly supplementVersion: string;
  readonly fixturePath: string;
  readonly fixtureRawSha256: string;
  readonly fixtureManifestRawSha256: string;
  readonly sourceWholeFileSha256: string;
  readonly ownerAuthorisationStatement: string;
  readonly labelCount: number;
  readonly labelByGoldId: ReadonlyMap<string, ProposedLabel>;
}

interface SupplementShape {
  readonly version?: unknown;
  readonly status?: unknown;
  readonly parentInferenceFreeze?: { readonly rawSha256?: unknown };
  readonly preservedAttempt?: { readonly aggregateSha256?: unknown; readonly attemptNo?: unknown };
  readonly labelFixture?: {
    readonly path?: unknown;
    readonly rawSha256?: unknown;
    readonly manifestRawSha256?: unknown;
    readonly recordCount?: unknown;
  };
  readonly provenance?: {
    readonly sourceWholeFileSha256?: unknown;
    readonly ownerAuthorisationStatement?: unknown;
  };
  readonly scope?: { readonly split?: unknown; readonly goldIds?: unknown };
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`the supplement's ${what} is not set.`);
  return value;
}

/**
 * `expectedGoldIds` is the canonical DEVELOPMENT corpus order. It is both the
 * membership test and the completeness test: the labels must cover exactly
 * these ids, no more and no fewer.
 */
export function loadGoldSupplement(
  repoRoot: string,
  supplementRelativePath: string,
  expected: {
    readonly freezeRawSha256: string;
    readonly artifactInventorySha256: string;
    readonly goldIds: readonly string[];
  },
): LoadedGoldSupplement {
  const supplementBytes = readFileSync(join(repoRoot, supplementRelativePath));
  let parsed: SupplementShape;
  try {
    parsed = JSON.parse(supplementBytes.toString('utf8')) as SupplementShape;
  } catch {
    fail(`${supplementRelativePath} is not valid JSON.`);
  }

  const status = requireString(parsed.status, 'status');
  if (status !== 'ACTIVE_SCORING_ONLY') {
    fail(
      `the supplement's status is ${status}; only ACTIVE_SCORING_ONLY carries usable gold. ` +
        'A supplement still awaiting authorised projection has null hashes and scores nothing.',
    );
  }
  const parentFreeze = requireString(parsed.parentInferenceFreeze?.rawSha256, 'parent freeze hash');
  if (parentFreeze !== expected.freezeRawSha256) {
    fail(
      `the supplement was built against freeze ${parentFreeze}; this run reads ` +
        `${expected.freezeRawSha256}.`,
    );
  }
  const attemptAggregate = requireString(
    parsed.preservedAttempt?.aggregateSha256,
    'preserved attempt aggregate hash',
  );
  if (attemptAggregate !== expected.artifactInventorySha256) {
    fail(
      `the supplement names preserved attempt ${attemptAggregate}; this run reads ` +
        `${expected.artifactInventorySha256}.`,
    );
  }
  if (parsed.scope?.split !== 'DEVELOPMENT') {
    fail("the supplement's scope is not DEVELOPMENT.");
  }

  const fixturePath = requireString(parsed.labelFixture?.path, 'label fixture path');
  const declaredFixtureSha256 = requireString(parsed.labelFixture?.rawSha256, 'label fixture hash');
  const fixtureBytes = readFileSync(join(repoRoot, fixturePath));
  const fixtureRawSha256 = sha256Hex(fixtureBytes);
  if (fixtureRawSha256 !== declaredFixtureSha256) {
    fail(
      `${fixturePath} hashes to ${fixtureRawSha256}; the supplement committed to ` +
        `${declaredFixtureSha256}. A gold label was changed after the supplement was written.`,
    );
  }

  const lines = fixtureBytes.toString('utf8').trim().split('\n');
  const labelByGoldId = new Map<string, ProposedLabel>();
  lines.forEach((line, index) => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      fail(`${fixturePath} line ${index + 1} is not valid JSON.`);
    }
    const item = AdjudicationItemSchema.safeParse(decoded);
    if (!item.success) fail(`${fixturePath} line ${index + 1} is not a valid adjudication item.`);
    if (labelByGoldId.has(item.data.goldId)) {
      fail(`${fixturePath} carries gold id ${item.data.goldId} more than once.`);
    }
    labelByGoldId.set(item.data.goldId, item.data.proposed);
  });

  const expectedIds = new Set(expected.goldIds);
  const missing = expected.goldIds.filter((goldId) => !labelByGoldId.has(goldId));
  const extra = [...labelByGoldId.keys()].filter((goldId) => !expectedIds.has(goldId));
  if (missing.length > 0) {
    fail(
      `${fixturePath} is missing ${missing.length} DEVELOPMENT gold id(s): ${missing.join(', ')}. ` +
        'A partial gold set would shrink a denominator silently.',
    );
  }
  if (extra.length > 0) {
    fail(
      `${fixturePath} carries ${extra.length} id(s) outside the canonical DEVELOPMENT corpus: ` +
        `${extra.join(', ')}.`,
    );
  }
  const declaredCount = parsed.labelFixture?.recordCount;
  if (declaredCount !== labelByGoldId.size) {
    fail(
      `the supplement declares ${String(declaredCount)} records; the fixture holds ` +
        `${labelByGoldId.size}.`,
    );
  }

  return {
    supplementPath: supplementRelativePath,
    supplementRawSha256: sha256Hex(supplementBytes),
    supplementVersion: requireString(parsed.version, 'version'),
    fixturePath,
    fixtureRawSha256,
    fixtureManifestRawSha256: requireString(
      parsed.labelFixture?.manifestRawSha256,
      'label fixture manifest hash',
    ),
    sourceWholeFileSha256: requireString(
      parsed.provenance?.sourceWholeFileSha256,
      'source whole-file hash',
    ),
    ownerAuthorisationStatement: requireString(
      parsed.provenance?.ownerAuthorisationStatement,
      'owner authorisation statement',
    ),
    labelCount: labelByGoldId.size,
    labelByGoldId,
  };
}
