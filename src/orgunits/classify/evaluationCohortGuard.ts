/**
 * EVALUATION-COHORT PREFLIGHT GUARD for the bounded classifier OPERATOR
 * entry point (`nwf-pe orgunits classify`).
 *
 * WHY THIS EXISTS. On 2026-10-08 an operational classifier call ran on an
 * organisation that the committed Draw V2 GEN1 assigns to FINAL_HOLDOUT
 * (governance incident `GOVERNANCE_INCIDENT_PARIS520_FINAL_HOLDOUT_EXPOSURE_V1`
 * in the Operator repository). Nothing in the operator path checked the
 * evaluation split. This module makes that check mandatory and FAIL-CLOSED:
 * an operator classification may start only when the committed cohort
 * metadata positively establishes that the organisation (and every
 * organisation the run's own fetch evidence names) is in NO protected
 * cohort.
 *
 * WHAT COUNTS AS PROTECTED. Exactly the committed, authoritative cohort
 * artifacts below, read in full and verified byte-for-byte against pinned
 * SHA-256 values:
 *
 *   - Draw V2 GEN1 `selection` (DEV_TRAIN / DEV_CONFIRM / FINAL_HOLDOUT) and
 *     `reserve` (every reserve position, consumed or not);
 *   - the Reserve Replacement Ledger V2 GEN1 (every replacement occupant);
 *   - the R50 DEV_TRAIN A4 handoff index (every review item's organisation,
 *     including cross-generation slots outside the Draw V2 selection);
 *   - the Frame V2 GEN1 `excludedHistoricalDevelopment` entries (the
 *     historical development evaluation set, identified by the frame's own
 *     flag so that no label fixture is ever opened here).
 *
 * WHAT IT NEVER DOES. It reads no page, no classification, no label, no
 * gold record, no review response and no adjudication. Its only database
 * reads are the organisation's identity and the run's fetch-evidence
 * `eche_row_key` values. It writes nothing, anywhere. It changes no draw,
 * ledger, split, denominator or historical row, and it is NOT used by the
 * evaluation runtime (which targets development cohorts by design) - only
 * by the operator command.
 *
 * FAIL-CLOSED. A missing, altered (hash mismatch), unparseable or
 * internally inconsistent artifact, or an organisation whose identity
 * conflicts with the artifacts (same key, different organisation id; or the
 * same organisation id under a different key), REFUSES. A change to any
 * pinned artifact - including a legitimate append to the evolving
 * replacement ledger - refuses every operator classification until the pin
 * is re-reviewed and updated in this file. That is deliberate: a newer
 * ledger may protect a new organisation, and guessing that it does not
 * would be exactly the weaker approximation this guard exists to prevent.
 *
 * NON-SEMANTIC. Identity matching is exact string equality on
 * `eche_row_key` (the stable source-row identity; the frame records why
 * organisation UUIDs are not stable across ingests) plus exact
 * `organisationId` equality as a conflict cross-check. No fuzzy matching, no
 * name or domain heuristics.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

/** One authoritative cohort artifact, pinned by the SHA-256 of its exact committed bytes. */
export interface PinnedCohortArtifact {
  readonly role: CohortArtifactRole;
  /** Repository-relative path. */
  readonly path: string;
  readonly sha256: string;
}

export type CohortArtifactRole = 'DRAW' | 'REPLACEMENT_LEDGER' | 'R50_HANDOFF_INDEX' | 'FRAME';

/**
 * THE PINS. Values are the committed bytes at Engine pin `25916c2`. Editing a
 * pin is a reviewed governance change, never a runtime option.
 */
export const EVALUATION_COHORT_ARTIFACT_PINS: readonly PinnedCohortArtifact[] = Object.freeze([
  {
    role: 'DRAW',
    path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_DRAW_V2_GEN1.json',
    sha256: 'b7021416894b7547cfe53d0d5f5e34b4e9c35843f8be35f0d2844bc67683b7b3',
  },
  {
    role: 'REPLACEMENT_LEDGER',
    path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_RESERVE_REPLACEMENT_LEDGER_V2_GEN1.json',
    sha256: '72c9af2c2b239a6eecb8e84d5a1139eb0b728b1330465f610e73165d7212f114',
  },
  {
    role: 'R50_HANDOFF_INDEX',
    path: 'docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json',
    sha256: '574e981cf5ec255102983b810685b544ff20e58fce6fb7fec5ad6fc53c1f77f5',
  },
  {
    role: 'FRAME',
    path: 'docs/evaluation/corpus/PHASE_2B_2D_METHOD_V2_FRAME_V2_GEN1.json',
    sha256: 'c16b31c9c18e368bbf99e2d45fc2de1a284dd42c9a483ed34c30187e77b18878',
  },
]);

/** This module lives at `src/orgunits/classify/`; the repository root is three levels up. */
export const ENGINE_REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type CohortMembership =
  | 'DRAW_SELECTION:DEV_TRAIN'
  | 'DRAW_SELECTION:DEV_CONFIRM'
  | 'DRAW_SELECTION:FINAL_HOLDOUT'
  | 'DRAW_RESERVE'
  | 'RESERVE_REPLACEMENT_OCCUPANT'
  | 'R50_DEV_TRAIN_REVIEW_ITEM'
  | 'HISTORICAL_DEVELOPMENT_EVALUATION';

const DRAW_SPLITS = ['DEV_TRAIN', 'DEV_CONFIRM', 'FINAL_HOLDOUT'] as const;

/** The verified, in-memory membership index. Holds identities only - never page text or labels. */
export interface EvaluationCohortRegistry {
  readonly membershipsByEcheRowKey: ReadonlyMap<string, ReadonlySet<CohortMembership>>;
  /** Every organisation id the artifacts bind to each key (draw and frame both carry one). */
  readonly organisationIdsByEcheRowKey: ReadonlyMap<string, ReadonlySet<string>>;
  readonly echeRowKeysByOrganisationId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly artifactSha256: Readonly<Record<CohortArtifactRole, string>>;
}

export type RegistryLoadResult =
  | { readonly ok: true; readonly registry: EvaluationCohortRegistry }
  | {
      readonly ok: false;
      readonly kind: 'EVALUATION_COHORT_METADATA_UNVERIFIED';
      /** Bounded: names the artifact role and the failed check, never file content. */
      readonly detail: string;
    };

export type CohortVerdict =
  | { readonly kind: 'ALLOWED' }
  | {
      readonly kind: 'EVALUATION_COHORT_PROTECTED';
      readonly echeRowKey: string;
      readonly memberships: readonly CohortMembership[];
    }
  | {
      readonly kind: 'EVALUATION_COHORT_CONFLICT';
      /** Bounded: identifiers only. */
      readonly detail: string;
    };

class CohortMetadataError extends Error {}

function fail(role: CohortArtifactRole, check: string): never {
  throw new CohortMetadataError(`${role}: ${check}`);
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayField(role: CohortArtifactRole, parent: unknown, name: string): unknown[] {
  if (!isRecord(parent) || !Array.isArray(parent[name])) fail(role, `missing array "${name}"`);
  return parent[name] as unknown[];
}

function stringField(role: CohortArtifactRole, parent: unknown, name: string): string {
  if (!isRecord(parent) || typeof parent[name] !== 'string' || parent[name] === '') {
    fail(role, `missing string "${name}"`);
  }
  return (parent as Record<string, string>)[name]!;
}

function integerField(role: CohortArtifactRole, parent: unknown, name: string): number {
  const value = isRecord(parent) ? parent[name] : undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(role, `missing non-negative integer "${name}"`);
  }
  return value;
}

/**
 * Builds the registry from already-read artifact bytes. PURE apart from
 * hashing: every structural and cross-artifact check runs here, so tests can
 * exercise each refusal with synthetic bytes and synthetic pins.
 */
export function buildEvaluationCohortRegistry(
  pins: readonly PinnedCohortArtifact[],
  bytesByRole: ReadonlyMap<CohortArtifactRole, Buffer | null>,
): RegistryLoadResult {
  try {
    const parsed = new Map<CohortArtifactRole, unknown>();
    const artifactSha256 = {} as Record<CohortArtifactRole, string>;
    for (const role of ['DRAW', 'REPLACEMENT_LEDGER', 'R50_HANDOFF_INDEX', 'FRAME'] as const) {
      const matching = pins.filter((p) => p.role === role);
      if (matching.length !== 1) fail(role, `expected exactly one pin, found ${matching.length}`);
      const bytes = bytesByRole.get(role) ?? null;
      if (bytes === null) fail(role, 'artifact missing or unreadable');
      const actual = sha256Hex(bytes);
      if (actual !== matching[0]!.sha256)
        fail(role, 'artifact bytes do not match the pinned SHA-256');
      try {
        parsed.set(role, JSON.parse(bytes.toString('utf8')));
      } catch {
        fail(role, 'artifact is not valid JSON');
      }
      artifactSha256[role] = actual;
    }

    const memberships = new Map<string, Set<CohortMembership>>();
    const orgIdsByKey = new Map<string, Set<string>>();
    const keysByOrgId = new Map<string, Set<string>>();
    const add = (key: string, membership: CohortMembership): void => {
      const set = memberships.get(key) ?? new Set<CohortMembership>();
      set.add(membership);
      memberships.set(key, set);
    };
    const bind = (key: string, organisationId: string): void => {
      (orgIdsByKey.get(key) ?? orgIdsByKey.set(key, new Set()).get(key)!).add(organisationId);
      (
        keysByOrgId.get(organisationId) ??
        keysByOrgId.set(organisationId, new Set()).get(organisationId)!
      ).add(key);
    };

    // --- Draw: selection + reserve -------------------------------------------
    const draw = parsed.get('DRAW');
    if (stringField('DRAW', draw, 'recordKind') !== 'DRAW_V2_GEN1')
      fail('DRAW', 'unexpected recordKind');
    const generationId = stringField('DRAW', draw, 'generationId');
    const counts = (draw as Record<string, unknown>).counts;
    const selection = arrayField('DRAW', draw, 'selection');
    const reserve = arrayField('DRAW', draw, 'reserve');
    if (selection.length !== integerField('DRAW', counts, 'selectionCount')) {
      fail('DRAW', 'selection length differs from counts.selectionCount');
    }
    if (reserve.length !== integerField('DRAW', counts, 'reserveCount')) {
      fail('DRAW', 'reserve length differs from counts.reserveCount');
    }
    const splitCounts = isRecord(counts) ? counts.splitCounts : undefined;
    const tally: Record<string, number> = {};
    const drawKeys = new Set<string>();
    const selectionSplit: string[] = [];
    const selectionKey: string[] = [];
    selection.forEach((entry, index) => {
      if (integerField('DRAW', entry, 'selectionIndex') !== index) {
        fail('DRAW', `selection entry ${index} is out of order`);
      }
      const key = stringField('DRAW', entry, 'echeRowKey');
      const split = stringField('DRAW', entry, 'split');
      if (!(DRAW_SPLITS as readonly string[]).includes(split)) {
        fail('DRAW', `selection entry ${index} has an unknown split`);
      }
      if (drawKeys.has(key)) fail('DRAW', `organisation drawn more than once (selection ${index})`);
      drawKeys.add(key);
      tally[split] = (tally[split] ?? 0) + 1;
      selectionSplit.push(split);
      selectionKey.push(key);
      add(key, `DRAW_SELECTION:${split}` as CohortMembership);
      bind(key, stringField('DRAW', entry, 'organisationId'));
    });
    for (const split of DRAW_SPLITS) {
      if (integerField('DRAW', splitCounts, split) !== (tally[split] ?? 0)) {
        fail('DRAW', `split count for ${split} differs from counts.splitCounts`);
      }
    }
    const reserveKey: string[] = [];
    reserve.forEach((entry, index) => {
      if (integerField('DRAW', entry, 'reserveRankPosition') !== index) {
        fail('DRAW', `reserve entry ${index} is out of order`);
      }
      if (isRecord(entry) && 'split' in entry)
        fail('DRAW', `reserve entry ${index} carries a split`);
      const key = stringField('DRAW', entry, 'echeRowKey');
      if (drawKeys.has(key))
        fail('DRAW', `organisation both drawn and reserved (reserve ${index})`);
      drawKeys.add(key);
      reserveKey.push(key);
      add(key, 'DRAW_RESERVE');
      bind(key, stringField('DRAW', entry, 'organisationId'));
    });

    // --- Replacement ledger: every occupant, with chain consistency -----------
    const ledger = parsed.get('REPLACEMENT_LEDGER');
    if (stringField('REPLACEMENT_LEDGER', ledger, 'generationId') !== generationId) {
      fail('REPLACEMENT_LEDGER', 'generationId differs from the draw');
    }
    const occupant = [...selectionKey];
    const usedReserve = new Set<number>();
    arrayField('REPLACEMENT_LEDGER', ledger, 'entries').forEach((entry, sequence) => {
      if (integerField('REPLACEMENT_LEDGER', entry, 'sequence') !== sequence) {
        fail('REPLACEMENT_LEDGER', `entry ${sequence} is out of order`);
      }
      const slot = integerField('REPLACEMENT_LEDGER', entry, 'selectionIndex');
      if (slot >= selection.length)
        fail('REPLACEMENT_LEDGER', `entry ${sequence} names no draw slot`);
      if (stringField('REPLACEMENT_LEDGER', entry, 'split') !== selectionSplit[slot]) {
        fail('REPLACEMENT_LEDGER', `entry ${sequence} split differs from its draw slot`);
      }
      if (stringField('REPLACEMENT_LEDGER', entry, 'replacedEcheRowKey') !== occupant[slot]) {
        fail(
          'REPLACEMENT_LEDGER',
          `entry ${sequence} does not replace the slot's current occupant`,
        );
      }
      const position = integerField('REPLACEMENT_LEDGER', entry, 'reserveRankPosition');
      const replacement = stringField('REPLACEMENT_LEDGER', entry, 'replacementEcheRowKey');
      if (position >= reserveKey.length || reserveKey[position] !== replacement) {
        fail(
          'REPLACEMENT_LEDGER',
          `entry ${sequence} replacement is not the named reserve position`,
        );
      }
      if (usedReserve.has(position))
        fail('REPLACEMENT_LEDGER', `entry ${sequence} reuses a reserve position`);
      usedReserve.add(position);
      occupant[slot] = replacement;
      add(replacement, 'RESERVE_REPLACEMENT_OCCUPANT');
    });

    // --- R50 DEV_TRAIN handoff index: every review item's organisation --------
    const r50 = parsed.get('R50_HANDOFF_INDEX');
    if (stringField('R50_HANDOFF_INDEX', r50, 'split') !== 'DEV_TRAIN') {
      fail('R50_HANDOFF_INDEX', 'unexpected split');
    }
    const items = arrayField('R50_HANDOFF_INDEX', r50, 'items');
    if (items.length === 0) fail('R50_HANDOFF_INDEX', 'no items');
    for (const item of items)
      add(stringField('R50_HANDOFF_INDEX', item, 'echeRowKey'), 'R50_DEV_TRAIN_REVIEW_ITEM');

    // --- Frame: historical development exclusions (flag only, no label file) --
    const frame = parsed.get('FRAME');
    if (stringField('FRAME', frame, 'generationId') !== generationId) {
      fail('FRAME', 'generationId differs from the draw');
    }
    const frameCounts = (frame as Record<string, unknown>).counts;
    const expectedHistorical = integerField(
      'FRAME',
      frameCounts,
      'excludedHistoricalDevelopmentCount',
    );
    let historical = 0;
    const frameKeys = new Set<string>();
    for (const entry of arrayField('FRAME', frame, 'entries')) {
      const key = stringField('FRAME', entry, 'echeRowKey');
      if (frameKeys.has(key)) fail('FRAME', 'duplicate echeRowKey');
      frameKeys.add(key);
      bind(key, stringField('FRAME', entry, 'organisationId'));
      const flag = isRecord(entry) ? entry.excludedHistoricalDevelopment : undefined;
      if (typeof flag !== 'boolean')
        fail('FRAME', 'entry without a boolean excludedHistoricalDevelopment');
      if (flag) {
        historical += 1;
        add(key, 'HISTORICAL_DEVELOPMENT_EVALUATION');
      }
    }
    if (historical !== expectedHistorical) {
      fail(
        'FRAME',
        'historical-development entries differ from counts.excludedHistoricalDevelopmentCount',
      );
    }

    return {
      ok: true,
      registry: {
        membershipsByEcheRowKey: memberships,
        organisationIdsByEcheRowKey: orgIdsByKey,
        echeRowKeysByOrganisationId: keysByOrgId,
        artifactSha256,
      },
    };
  } catch (error) {
    if (error instanceof CohortMetadataError) {
      return { ok: false, kind: 'EVALUATION_COHORT_METADATA_UNVERIFIED', detail: error.message };
    }
    throw error;
  }
}

/** Reads the pinned artifacts from the Engine checkout this module is loaded from, then verifies them. */
export function loadEvaluationCohortRegistry(
  pins: readonly PinnedCohortArtifact[] = EVALUATION_COHORT_ARTIFACT_PINS,
  repositoryRoot: string = ENGINE_REPOSITORY_ROOT,
  read: (absolutePath: string) => Buffer = (p) => readFileSync(p),
): RegistryLoadResult {
  const bytes = new Map<CohortArtifactRole, Buffer | null>();
  for (const pin of pins) {
    try {
      bytes.set(pin.role, read(`${repositoryRoot.replace(/\/?$/, '/')}${pin.path}`));
    } catch {
      bytes.set(pin.role, null);
    }
  }
  return buildEvaluationCohortRegistry(pins, bytes);
}

/** The identities a single operator classification would touch. */
export interface CohortSubject {
  readonly organisationId: string;
  readonly echeRowKey: string;
  /** Every distinct `eche_row_key` the run's own fetch evidence names (may be empty). */
  readonly runEcheRowKeys: readonly string[];
}

/** PURE. ALLOWED only when no identity is protected and no identity conflicts with the artifacts. */
export function evaluateCohortMembership(
  registry: EvaluationCohortRegistry,
  subject: CohortSubject,
): CohortVerdict {
  // 1. The organisation id must not be bound to a DIFFERENT key, and the key
  //    must not be bound to a DIFFERENT organisation id.
  const keysForId = registry.echeRowKeysByOrganisationId.get(subject.organisationId);
  if (keysForId !== undefined && [...keysForId].some((key) => key !== subject.echeRowKey)) {
    return {
      kind: 'EVALUATION_COHORT_CONFLICT',
      detail: `organisation ${subject.organisationId} is bound to a different eche_row_key in the cohort metadata`,
    };
  }
  const idsForKey = registry.organisationIdsByEcheRowKey.get(subject.echeRowKey);
  if (idsForKey !== undefined && [...idsForKey].some((id) => id !== subject.organisationId)) {
    return {
      kind: 'EVALUATION_COHORT_CONFLICT',
      detail: `eche_row_key of organisation ${subject.organisationId} is bound to a different organisation id in the cohort metadata`,
    };
  }
  // 2. Membership of the organisation itself, then of every OTHER
  //    organisation the run's fetch evidence names. A run that names an
  //    unprotected other organisation is not a cohort question: the landed
  //    assembler refuses it (ORGANISATION_RUN_MISMATCH) before any page read,
  //    and that landed refusal stays authoritative.
  for (const key of [
    subject.echeRowKey,
    ...subject.runEcheRowKeys.filter((k) => k !== subject.echeRowKey),
  ]) {
    const memberships = registry.membershipsByEcheRowKey.get(key);
    if (memberships !== undefined && memberships.size > 0) {
      return {
        kind: 'EVALUATION_COHORT_PROTECTED',
        echeRowKey: key,
        memberships: [...memberships].sort(),
      };
    }
  }
  return { kind: 'ALLOWED' };
}

/**
 * The guard's only database reads: the organisation's identity and the
 * run's fetch-evidence keys. Both tables are granted to `nwf_classifier`
 * (migration 0009 §17). Returns null when the organisation does not exist,
 * so the caller's landed ORGANISATION_NOT_FOUND path stays authoritative.
 */
export async function loadCohortSubject(
  pool: pg.Pool,
  organisationId: string,
  runId: string,
): Promise<CohortSubject | null> {
  const org = await pool.query<{ id: string; eche_row_key: string }>(
    `SELECT id, eche_row_key FROM organisations WHERE id = $1`,
    [organisationId],
  );
  const row = org.rows[0];
  if (row === undefined) return null;
  const run = await pool.query<{ eche_row_key: string }>(
    `SELECT DISTINCT eche_row_key FROM orgunit_fetch_observations WHERE run_id = $1`,
    [runId],
  );
  return {
    organisationId: row.id,
    echeRowKey: row.eche_row_key,
    runEcheRowKeys: run.rows.map((r) => r.eche_row_key).sort(),
  };
}

/** Operator-facing refusal text: bounded, identifiers and membership names only. */
export function describeCohortRefusal(
  verdict: Exclude<CohortVerdict, { kind: 'ALLOWED' }>,
): string {
  if (verdict.kind === 'EVALUATION_COHORT_PROTECTED') {
    return `organisation is in a protected evaluation cohort (${verdict.memberships.join(', ')}); operator classification is refused`;
  }
  return verdict.detail;
}
