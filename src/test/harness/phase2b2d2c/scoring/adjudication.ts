/**
 * PHASE 2B-2D2C-G2 — LOADING THE OWNER GOLD-ADJUDICATION RECORD.
 *
 * F4A closed BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION because removing the
 * one unresolved gold item flipped a frozen gate verdict. That status names
 * the event it was waiting for. This is the record of that event.
 *
 * IT DISCHARGES A BLOCKER; IT NEVER CHANGES A NUMBER. The only reason a
 * confirmation is allowed to change a derivation's status at all is that it
 * confirms, byte for byte, the label the derivation ALREADY scored — so
 * every prediction, gold value, denominator and threshold is identical
 * before and after. A record naming any other verdict or unit type would
 * require a new gold projection and a new derivation, and this loader
 * refuses it rather than quietly re-scoring.
 *
 * IT FAILS CLOSED ON EVERY MISMATCH, and each check answers a specific way
 * an adjudication could stop describing this gold:
 *
 *   schema version      a record written against a different contract.
 *   DEVELOPMENT membership  a record naming an id outside the canonical
 *                       DEVELOPMENT corpus — the one way a HOLDOUT item
 *                       could reach a scoring run through this door.
 *   record present      a record naming a gold id the fixture does not hold.
 *   verdict / unit type a record whose confirmed values no longer match the
 *                       committed label, i.e. a label change wearing a
 *                       confirmation's clothes.
 *   record hash         the exact bytes of the referenced gold line. This is
 *                       what makes "no gold byte changed" checkable rather
 *                       than asserted.
 *   labelChanged        a record that admits to changing a label is refused
 *                       outright; this task has no authority to apply one.
 *   owner statement     byte-exact. A paraphrase is not the owner's decision.
 *   blinding flags      a decision taken with model predictions or metric
 *                       effects in view is not a decision on the evidence.
 *
 * Absence is not an error: a scoring run given no adjudication path scores
 * exactly as F4A did, and still reports the blocker as active.
 *
 * PURE apart from reading the two files it is told to read. No network, no
 * database, no clock, no environment read.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProposedLabel } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { sha256Hex } from '../freeze.js';

export class OwnerAdjudicationError extends Error {
  override readonly name = 'OwnerAdjudicationError';
}

function fail(message: string): never {
  throw new OwnerAdjudicationError(message);
}

/** Versions the RECORD CONTRACT. A record written against another is refused. */
export const OWNER_ADJUDICATION_SCHEMA_VERSION = 'phase2b-2d2c-dev-owner-adjudication-v1';

/** The only decision this contract implements. A change is a new contract. */
export const OWNER_ADJUDICATION_DECISION = 'KEEP_UNIT_PAGE';

/**
 * The owner's decision, byte for byte, including the em dash. A record that
 * differs anywhere — a hyphen for the dash, a trimmed full stop, different
 * casing — is refused, because a paraphrase of a decision is not the
 * decision.
 */
export const OWNER_ADJUDICATION_STATEMENT =
  'KEEP_UNIT_PAGE — I adjudicate ge789b0f0aedc398c as UNIT_PAGE based only on the frozen ' +
  'document and rubric.';

/** The evidence class the decision was taken on; nothing else is accepted. */
export const OWNER_ADJUDICATION_BASIS = 'FROZEN_DOCUMENT_AND_RUBRIC';

export interface LoadedOwnerAdjudication {
  readonly recordPath: string;
  readonly recordRawSha256: string;
  readonly schemaVersion: string;
  readonly goldId: string;
  readonly decision: string;
  readonly ownerStatement: string;
  readonly basis: string;
  readonly labelChanged: false;
  readonly confirmedVerdict: string;
  readonly confirmedUnitType: string;
  readonly goldRecordSha256: string;
  readonly recordedAtUtc: string;
  readonly recordedAtUtcMeaning: string;
  readonly modelPredictionsConsidered: false;
  readonly metricEffectsConsidered: false;
  readonly supplementRawSha256: string;
  readonly freezeRawSha256: string;
}

interface RecordShape {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly goldId?: unknown;
  readonly split?: unknown;
  readonly decision?: unknown;
  readonly ownerStatement?: unknown;
  readonly basis?: unknown;
  readonly modelPredictionsConsidered?: unknown;
  readonly metricEffectsConsidered?: unknown;
  readonly labelChanged?: unknown;
  readonly existingVerdictConfirmed?: unknown;
  readonly existingUnitTypeConfirmed?: unknown;
  readonly recordedAtUtc?: unknown;
  readonly recordedAtUtcMeaning?: unknown;
  readonly referencedGoldRecord?: {
    readonly fixturePath?: unknown;
    readonly fixtureRawSha256?: unknown;
    readonly recordSha256?: unknown;
  };
  readonly parents?: {
    readonly inferenceFreezeRawSha256?: unknown;
    readonly scoringSupplementRawSha256?: unknown;
    readonly preservedAttemptAggregateSha256?: unknown;
  };
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`the owner-adjudication record's ${what} is not set.`);
  }
  return value;
}

/** An ISO-8601 UTC instant to the second. Nothing looser is a timestamp. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * `expected` is everything the run already verified independently, so the
 * record is checked AGAINST the run rather than believed.
 */
export function loadOwnerAdjudication(
  repoRoot: string,
  recordRelativePath: string,
  expected: {
    readonly freezeRawSha256: string;
    readonly supplementRawSha256: string;
    readonly artifactInventorySha256: string;
    /** The canonical DEVELOPMENT corpus ids, in corpus order. */
    readonly developmentGoldIds: readonly string[];
    /** The supplement's own labels, already verified against the fixture hash. */
    readonly labelByGoldId: ReadonlyMap<string, ProposedLabel>;
  },
): LoadedOwnerAdjudication {
  const recordBytes = readFileSync(join(repoRoot, recordRelativePath));
  let parsed: RecordShape;
  try {
    parsed = JSON.parse(recordBytes.toString('utf8')) as RecordShape;
  } catch {
    fail(`${recordRelativePath} is not valid JSON.`);
  }

  const schemaVersion = requireString(parsed.schemaVersion, 'schemaVersion');
  if (schemaVersion !== OWNER_ADJUDICATION_SCHEMA_VERSION) {
    fail(
      `the record declares schema ${schemaVersion}; this scorer implements ` +
        `${OWNER_ADJUDICATION_SCHEMA_VERSION}.`,
    );
  }
  const status = requireString(parsed.status, 'status');
  if (status !== 'ACTIVE_SCORING_ONLY') {
    fail(`the record's status is ${status}; only ACTIVE_SCORING_ONLY is usable.`);
  }

  const goldId = requireString(parsed.goldId, 'goldId');
  if (parsed.split !== 'DEVELOPMENT') {
    fail(
      `the record's split is ${String(parsed.split)}; only a DEVELOPMENT item may be adjudicated ` +
        'through a scoring-only record.',
    );
  }
  if (!expected.developmentGoldIds.includes(goldId)) {
    fail(
      `the record adjudicates ${goldId}, which is NOT one of the ` +
        `${expected.developmentGoldIds.length} canonical DEVELOPMENT gold ids. A non-DEVELOPMENT ` +
        'item can never be adjudicated here.',
    );
  }

  const decision = requireString(parsed.decision, 'decision');
  if (decision !== OWNER_ADJUDICATION_DECISION) {
    fail(
      `the record's decision is ${decision}; this contract implements only ` +
        `${OWNER_ADJUDICATION_DECISION}. Any other decision changes a gold label and needs a new ` +
        'projection, not a discharge.',
    );
  }
  const ownerStatement = requireString(parsed.ownerStatement, 'ownerStatement');
  if (ownerStatement !== OWNER_ADJUDICATION_STATEMENT) {
    fail(
      "the record's ownerStatement differs from the owner's decision by at least one byte. A " +
        'paraphrase is not the decision.',
    );
  }
  const basis = requireString(parsed.basis, 'basis');
  if (basis !== OWNER_ADJUDICATION_BASIS) {
    fail(`the record's basis is ${basis}; only ${OWNER_ADJUDICATION_BASIS} is accepted.`);
  }
  if (parsed.modelPredictionsConsidered !== false) {
    fail(
      'the record does not assert modelPredictionsConsidered=false. A decision taken with model ' +
        'predictions in view is not a decision on the frozen evidence.',
    );
  }
  if (parsed.metricEffectsConsidered !== false) {
    fail(
      'the record does not assert metricEffectsConsidered=false. A decision taken with metric ' +
        'effects in view would let a threshold pick a gold label.',
    );
  }
  if (parsed.labelChanged !== false) {
    fail(
      'the record declares labelChanged=true. This scorer discharges a blocker; it never applies ' +
        'a label change.',
    );
  }

  const confirmedVerdict = requireString(
    parsed.existingVerdictConfirmed,
    'existingVerdictConfirmed',
  );
  const confirmedUnitType = requireString(
    parsed.existingUnitTypeConfirmed,
    'existingUnitTypeConfirmed',
  );
  const committed = expected.labelByGoldId.get(goldId);
  if (committed === undefined) {
    fail(
      `the record adjudicates ${goldId}, but the gold fixture this run loaded holds no record ` +
        'for it.',
    );
  }
  if (committed.verdict !== confirmedVerdict) {
    fail(
      `the record confirms verdict ${confirmedVerdict} for ${goldId}, but the committed gold says ` +
        `${committed.verdict}. That is a label CHANGE, not a confirmation.`,
    );
  }
  if (committed.unit_type !== confirmedUnitType) {
    fail(
      `the record confirms unit_type ${confirmedUnitType} for ${goldId}, but the committed gold ` +
        `says ${String(committed.unit_type)}. That is a label CHANGE, not a confirmation.`,
    );
  }

  const fixturePath = requireString(parsed.referencedGoldRecord?.fixturePath, 'fixture path');
  const declaredFixtureSha256 = requireString(
    parsed.referencedGoldRecord?.fixtureRawSha256,
    'fixture hash',
  );
  const fixtureBytes = readFileSync(join(repoRoot, fixturePath));
  const fixtureRawSha256 = sha256Hex(fixtureBytes);
  if (fixtureRawSha256 !== declaredFixtureSha256) {
    fail(
      `${fixturePath} hashes to ${fixtureRawSha256}; the record committed to ` +
        `${declaredFixtureSha256}.`,
    );
  }

  // The record's own line, hashed WITHOUT its terminating LF. This is the
  // narrowest possible statement of "this exact gold record is the one the
  // owner confirmed": the whole-fixture hash would also move if an unrelated
  // item changed, and would therefore not name THIS record.
  const declaredRecordSha256 = requireString(
    parsed.referencedGoldRecord?.recordSha256,
    'referenced gold record hash',
  );
  const matchingLines = fixtureBytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => {
      try {
        return (JSON.parse(line) as { goldId?: unknown }).goldId === goldId;
      } catch {
        return false;
      }
    });
  if (matchingLines.length !== 1) {
    fail(
      `${fixturePath} holds ${matchingLines.length} record(s) for ${goldId}; exactly one is ` +
        'required.',
    );
  }
  const actualRecordSha256 = sha256Hex(Buffer.from(matchingLines[0] ?? '', 'utf8'));
  if (actualRecordSha256 !== declaredRecordSha256) {
    fail(
      `the gold record for ${goldId} hashes to ${actualRecordSha256}; the owner adjudicated ` +
        `${declaredRecordSha256}. The record the owner saw is not the record on disk.`,
    );
  }

  const freezeRawSha256 = requireString(
    parsed.parents?.inferenceFreezeRawSha256,
    'parent inference-freeze hash',
  );
  if (freezeRawSha256 !== expected.freezeRawSha256) {
    fail(`the record names freeze ${freezeRawSha256}; this run reads ${expected.freezeRawSha256}.`);
  }
  const supplementRawSha256 = requireString(
    parsed.parents?.scoringSupplementRawSha256,
    'parent scoring-supplement hash',
  );
  if (supplementRawSha256 !== expected.supplementRawSha256) {
    fail(
      `the record names supplement ${supplementRawSha256}; this run reads ` +
        `${expected.supplementRawSha256}.`,
    );
  }
  const attemptAggregate = requireString(
    parsed.parents?.preservedAttemptAggregateSha256,
    'preserved attempt aggregate hash',
  );
  if (attemptAggregate !== expected.artifactInventorySha256) {
    fail(
      `the record names preserved attempt ${attemptAggregate}; this run reads ` +
        `${expected.artifactInventorySha256}.`,
    );
  }

  const recordedAtUtc = requireString(parsed.recordedAtUtc, 'recordedAtUtc');
  if (!ISO_UTC.test(recordedAtUtc)) {
    fail(`the record's recordedAtUtc (${recordedAtUtc}) is not an ISO-8601 UTC instant.`);
  }
  const recordedAtUtcMeaning = requireString(parsed.recordedAtUtcMeaning, 'recordedAtUtcMeaning');
  if (!recordedAtUtcMeaning.includes('RECORDING TIME ONLY')) {
    fail(
      "the record's recordedAtUtcMeaning must say RECORDING TIME ONLY, so the timestamp is never " +
        'read as the instant the owner decided.',
    );
  }

  return {
    recordPath: recordRelativePath,
    recordRawSha256: sha256Hex(recordBytes),
    schemaVersion,
    goldId,
    decision,
    ownerStatement,
    basis,
    labelChanged: false,
    confirmedVerdict,
    confirmedUnitType,
    goldRecordSha256: actualRecordSha256,
    recordedAtUtc,
    recordedAtUtcMeaning,
    modelPredictionsConsidered: false,
    metricEffectsConsidered: false,
    supplementRawSha256,
    freezeRawSha256,
  };
}
