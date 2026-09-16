/**
 * PHASE 2B-2D2C-F0X — THE DURABLE OUTER-SLOT IDENTITY RECORD.
 *
 * `coordinator.ts`'s `runExperiment` already writes an
 * `AUTHORISATION_CONSUMPTION` marker as the very first thing it does, but
 * that marker's own shape (`authorisationSha256`, `attemptNo`,
 * `experimentDir`, `consumedAtUtc`) is the INNER identity only — it says
 * nothing about which STUDY, which SLOT, or which of the two historical
 * attempts (3 or 4) a replication run is standing in for. A directory
 * NAME is not proof of any of that: this record is, and it is written
 * UNDER the slot's own output root so a copied or moved empirical tree
 * carries its own identity with it, detectably.
 *
 * This module does not extend `ARTIFACT_KINDS` (`artifacts.ts`) and does
 * not touch `coordinator.ts`: `writeFileOnceDurably` already takes a bare
 * path and text, with no dependency on the closed `ArtifactKind` union, so
 * a dedicated envelope here needs no change to either already-tested,
 * already-audited module. Write-once, durable, self-hashed — the same
 * `canonicalStringify` + SHA-256 discipline every other artifact in this
 * lineage uses, reimplemented here in three lines rather than imported,
 * because importing `envelopeOf` would require an `ArtifactKind` this
 * record deliberately is not one of.
 *
 * F0X CORRECTIVE CLOSURE — CONSUMPTION SEMANTICS, STATED EXPLICITLY: this
 * record's durable, write-once CREATION under `record.outputRoot` IS the
 * act that consumes a slot's F0X per-slot authorisation for
 * replication-study purposes. It is not a note ABOUT consumption written
 * after the fact — it is the authoritative F0X per-slot
 * authorisation-consumption fact. `consumedAtUtc` is therefore truthful: the
 * instant this write durably lands is the instant the authorisation is
 * spent. `coordinator.ts`'s own later `authorisations/<sha>.json` marker
 * (written by `runExperiment`, once it starts) remains a SEPARATE, additional,
 * INNER historical-run consumption marker — a legacy fact about that
 * pre-existing machinery, not this record's replacement. A caller answering
 * "has this slot's F0X authorisation already been consumed?" must treat
 * EITHER a matching valid outer-identity record (this module,
 * `isConsumedByOuterSlotIdentity`) OR a matching legacy coordinator marker
 * (`coordinator.ts`'s `isAuthorisationConsumed`) as spent — never only one of
 * the two, and never a study-wide root in place of the SLOT's own output
 * root. A process crash strictly BEFORE this record's write leaves no trace
 * of either kind: that failure is Class A
 * (`FAILURE_BEFORE_AUTHORISATION_CONSUMPTION`, `sequencing.ts`), genuinely
 * indistinguishable from "never attempted". A crash AFTER this record's
 * write but before `runExperiment` ever starts is a DIFFERENT, confirmed
 * fact — `AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL` (Class B)
 * — because this record already exists.
 *
 * PURE aside from the injected clock and writer. No network, no database.
 */
import { join } from 'node:path';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { writeFileOnceDurably, type DurableWriteReport } from '../artifacts.js';
import { sha256Hex } from '../f0v/studyPlanCore.js';
import type { StudyVariantName } from '../f0v/studyPlanCore.js';

export const OUTER_SLOT_IDENTITY_FILE_NAME = 'study-slot-identity.json';
export const OUTER_SLOT_IDENTITY_VERSION = 'phase2b-2d2c-f0x-outer-slot-identity-v1';

export interface OuterSlotIdentityRecord {
  readonly recordVersion: typeof OUTER_SLOT_IDENTITY_VERSION;
  readonly studyId: 'REPLICATION_V4_V5_N5';
  readonly f0vFreezeRawSha256: string;
  readonly f0vApprovalRecordRawSha256: string;
  readonly f0vPlanSha256: string;
  readonly f0uMethodologyRawSha256: string;
  readonly executionIntegrationCommit: string;
  readonly slotId: string;
  readonly sequence: number;
  readonly pairNumber: number;
  readonly variantName: StudyVariantName;
  readonly sourceHistoricalAttemptNo: 3 | 4;
  readonly sourceHistoricalFreezeRawSha256: string;
  readonly sourceHistoricalPlanSha256: string;
  readonly runtimeCommit: string;
  readonly promptSha256: string;
  readonly candidateAuthorisationSha256: string;
  readonly studyExecutionApprovalSha256: string;
  readonly outputRoot: string;
  readonly consumedAtUtc: string;
}

export interface OuterSlotIdentityEnvelope {
  readonly record: OuterSlotIdentityRecord;
  readonly recordSha256: string;
}

export function outerSlotIdentityPathOf(outputRoot: string): string {
  return join(outputRoot, OUTER_SLOT_IDENTITY_FILE_NAME);
}

function envelopeOf(record: OuterSlotIdentityRecord): OuterSlotIdentityEnvelope {
  return { record, recordSha256: sha256Hex(canonicalStringify(record)) };
}

/**
 * Writes the outer-slot identity record write-once under `record.outputRoot`.
 * Called EXACTLY ONCE per slot, by the study executor, immediately before
 * `runExperiment` is invoked for that slot — so a crash between this write
 * and the child-manifest write for logical evaluation 1 is exactly Class B
 * (`sequencing.ts`), and a crash before this write leaves no trace at all
 * (Class A / no evidence), by construction. Throws `WriteOnceCollisionError`
 * if the record already exists — a slot's outer identity is written once,
 * ever, and this function never overwrites one.
 */
export function writeOuterSlotIdentity(record: OuterSlotIdentityRecord): {
  readonly envelope: OuterSlotIdentityEnvelope;
  readonly report: DurableWriteReport;
} {
  const envelope = envelopeOf(record);
  const report = writeFileOnceDurably(
    outerSlotIdentityPathOf(record.outputRoot),
    `${JSON.stringify(envelope, null, 2)}\n`,
  );
  return { envelope, report };
}

/** Re-reads and re-verifies one outer-slot identity record; never throws on absence or corruption. */
export function readOuterSlotIdentity(
  outputRoot: string,
  readFile: (path: string) => Buffer,
):
  | { readonly ok: true; readonly envelope: OuterSlotIdentityEnvelope }
  | { readonly ok: false; readonly detail: string } {
  let bytes: Buffer;
  try {
    bytes = readFile(outerSlotIdentityPathOf(outputRoot));
  } catch (error) {
    return {
      ok: false,
      detail: `not readable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, detail: 'not valid JSON.' };
  }
  const envelope = parsed as Partial<OuterSlotIdentityEnvelope>;
  if (envelope.record === undefined || envelope.recordSha256 === undefined) {
    return { ok: false, detail: 'missing record or recordSha256.' };
  }
  const recomputed = sha256Hex(canonicalStringify(envelope.record));
  if (recomputed !== envelope.recordSha256) {
    return {
      ok: false,
      detail: `recordSha256 mismatch: file names ${envelope.recordSha256}, recomputed ${recomputed}.`,
    };
  }
  return { ok: true, envelope: envelope as OuterSlotIdentityEnvelope };
}

/**
 * Request-free: true iff a VALID outer-slot identity record already exists
 * under `outputRoot` (re-verified via `readOuterSlotIdentity`'s own
 * recomputed-hash check — a corrupt or tampered record is never trusted)
 * AND that record names EXACTLY `authorisationSha256` as the candidate it
 * consumed. This is HALF of the slot-scoped consumption answer (see the
 * module docstring): a caller determining whether a slot's F0X
 * authorisation has been consumed combines this with the coordinator's own
 * legacy marker check (`coordinator.ts`'s `isAuthorisationConsumed`, scoped
 * to the SAME slot output root) and treats either as spent. A missing or
 * corrupt record here is never itself evidence of non-consumption — it is
 * simply this half's own "no" — because the legacy marker may still say
 * "yes".
 */
export function isConsumedByOuterSlotIdentity(
  outputRoot: string,
  authorisationSha256: string,
  readFile: (path: string) => Buffer,
): boolean {
  const read = readOuterSlotIdentity(outputRoot, readFile);
  return read.ok && read.envelope.record.candidateAuthorisationSha256 === authorisationSha256;
}
