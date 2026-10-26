/**
 * REL harvest H2 (ported from REL-F1-R2 Wave 2 item c) - THE SUBJECT-ROOTED
 * CLASSIFIER HANDOFF ASSEMBLY (`nwf-pe.subject-classifier-handoff.v1-provisional`),
 * ENGINE-LOCAL and PROVISIONAL.
 *
 * WHY THIS EXISTS. A discovery subject in Japan or Mexico has no ECHE row
 * (Matrix Amendment A1 G11), and the landed classifier handoff
 * (`classify/assemble.ts`) is keyed by an organisation and its `eche_row_key`
 * end to end. This module assembles the SAME evidence grain for ONE
 * subject-rooted research run - the same eligible candidates (rank <= the
 * landed per-(root, track) cutoff), the same dedupe by response SHA-256, the
 * same excerpt, heading and payload bounds, the same deterministic order and
 * canonical serialisation - keyed by SUBJECT identity (subject id, admission
 * id, run id). It never invents an `eche_row_key`, an organisation id or a
 * country: none exists for these subjects, and none appears here.
 *
 * WHAT IT DOES NOT DO - THE CALL PATH IS BLOCKED, BY TYPE. The result is a
 * `SubjectClassifierBatch`, not a `ClassifierBatch`, so it cannot be handed
 * to `classify/orchestrate.ts`, persisted by `classify/persist.ts`, or sent
 * by the operator CLI. Making it callable would change frozen classifier
 * artefacts, each listed in `SUBJECT_CLASSIFIER_CALL_BLOCKERS` - the reason
 * this slice stops at assembly. No classifier file is modified or imported
 * for anything but its pure helpers and constants.
 *
 * READ-ONLY. Every statement is a SELECT, on a `research` or `readonly`
 * pool (the classifier role cannot read `subject_research_admissions`).
 * Opens no socket, reads no environment, writes nothing.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';

import { canonicalStringify } from '../classify/canonical.js';
import {
  EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION,
  MAX_BATCH_PAYLOAD_CODE_POINTS,
  MAX_CANDIDATES_PER_ROOT_TRACK,
  MAX_EXCERPT_CODE_POINTS,
  MAX_HEADING_CODE_POINTS,
  MAX_HEADINGS_PER_DOCUMENT,
  MAX_UNIQUE_DOCUMENTS_PER_BATCH,
} from '../classify/constants.js';
import {
  dedupeByResponseSha256,
  distinctRootKeys,
  distinctTracks,
  distinctUrls,
  type DedupedGroup,
} from '../classify/dedupe.js';
import { loadEligibleRows } from '../classify/loaders.js';
import { checkRunCompleted } from '../classify/runStatus.js';
import type { ClassifierDocument, ClassifierSignal } from '../classify/types.js';
import { truncateToCodePointLimit, unicodeCodePointLength } from '../web/extract.js';

export const SUBJECT_CLASSIFIER_HANDOFF_CONTRACT =
  'nwf-pe.subject-classifier-handoff.v1-provisional';
export const SUBJECT_CLASSIFIER_ASSEMBLY_VERSION = 'orgunit-subject-classifier-assembly-v1';

/** The classifier CALL for a subject batch is not available in this build. */
export const SUBJECT_CLASSIFIER_CALL_STATUS = 'BLOCKED_PENDING_OWNER_AMENDMENT';

/**
 * Exactly what a classifier call on subject-rooted evidence would change,
 * file by file. Each is a frozen or OWNER-bound artefact; none is changed
 * here (REL-F1-R2 Wave 2 STOP on item c's call path, kept by REL harvest H2;
 * ADR 0025 D8: the classifier cannot take subject-rooted evidence).
 */
export const SUBJECT_CLASSIFIER_CALL_BLOCKERS = Object.freeze([
  'CLASSIFY_TYPES_BATCH_CONTEXT_REQUIRES_ECHE_ROW_KEY_AND_COUNTRY_AND_CLAIM_OR_PROMOTION_ROOT',
  'CLASSIFY_PROMPT_V7_2_DESCRIBES_BATCH_CONTEXT_AS_ECHE_ROW_KEY_AND_ECHE_COUNTRY',
  'MIGRATION_0009_CLASSIFIER_CALLS_ECHE_ROW_KEY_NOT_NULL_AND_ROOT_KEY_CLAIM_OR_PROMOTION_ONLY',
  'CLASSIFY_LOADERS_ROOT_KIND_AND_ORGANISATION_BINDING_REFUSE_SUBJECT_ROOTS',
  'ADR_0025_D8_CLASSIFIER_CANNOT_TAKE_SUBJECT_EVIDENCE',
] as const);

export interface SubjectRootRef {
  readonly rootKey: string;
  readonly authorityKind: 'subject_admission';
  readonly url: string;
}

/** Batch context keyed by subject identity. No ECHE key, organisation id or country exists for it. */
export interface SubjectClassifierBatchContext {
  readonly contract: typeof SUBJECT_CLASSIFIER_HANDOFF_CONTRACT;
  readonly subjectId: string;
  readonly admissionId: string;
  readonly runId: string;
  readonly ruleVersion: string;
  readonly fetchPolicyVersion: string;
  readonly assemblyVersion: typeof SUBJECT_CLASSIFIER_ASSEMBLY_VERSION;
  /** NULL for the whole run; the root key when the payload bound split the run. */
  readonly rootKey: string | null;
  readonly roots: readonly SubjectRootRef[];
}

/** `ClassifierDocument`'s exact grain, with the subject root in place of a claim/promotion root. */
export type SubjectClassifierDocument = Omit<ClassifierDocument, 'roots'> & {
  readonly roots: readonly SubjectRootRef[];
};

export interface SubjectClassifierBatch {
  readonly context: SubjectClassifierBatchContext;
  readonly documents: readonly SubjectClassifierDocument[];
}

export interface AssembledSubjectBatch {
  readonly batch: SubjectClassifierBatch;
  /** SHA-256 of `canonicalStringify({ context, documents })`, as `classify/canonical.ts` hashes a batch. */
  readonly assemblyInputSha256: string;
  readonly subjectsByDocIndex: ReadonlyMap<number, readonly string[]>;
  readonly pageEvidenceIdByDocIndex: ReadonlyMap<number, string>;
}

export type SubjectAssemblyResult =
  | {
      readonly kind: 'NO_CANDIDATES';
      readonly subjectId: string;
      readonly admissionId: string;
      readonly runId: string;
    }
  | {
      readonly kind: 'BATCHES';
      readonly subjectId: string;
      readonly admissionId: string;
      readonly runId: string;
      readonly callStatus: typeof SUBJECT_CLASSIFIER_CALL_STATUS;
      readonly callBlockers: typeof SUBJECT_CLASSIFIER_CALL_BLOCKERS;
      readonly batches: readonly AssembledSubjectBatch[];
    };

export type SubjectHandoffRefusalCode =
  | 'RUN_UNKNOWN'
  | 'RUN_NOT_SUBJECT_ROOTED'
  | 'RUN_NOT_COMPLETED'
  | 'ADMISSION_UNKNOWN'
  | 'ROOT_UNRESOLVED'
  | 'EXTRACTION_VERSION_UNSUPPORTED'
  | 'PAYLOAD_BOUND_EXCEEDED';

export class SubjectClassifierHandoffRefusal extends Error {
  readonly code: SubjectHandoffRefusalCode;

  constructor(code: SubjectHandoffRefusalCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'SubjectClassifierHandoffRefusal';
    this.code = code;
  }
}

const SUBJECT_ROOT_SCOPE = /^subject_admission:([0-9a-f-]{36})$/;

/**
 * Assembles every subject batch for ONE completed subject-rooted run. Refuses
 * an ECHE run, an unfinished run and a run whose admission is unknown.
 */
export async function assembleSubjectClassifierHandoff(
  pool: pg.Pool,
  input: { readonly runId: string },
): Promise<SubjectAssemblyResult> {
  const runs = await pool.query<{
    id: string;
    root_scope: string;
    rule_version: string;
    fetch_policy_version: string;
  }>(
    `SELECT id, root_scope, rule_version, fetch_policy_version
       FROM orgunit_research_runs WHERE id = $1`,
    [input.runId],
  );
  const run = runs.rows[0];
  if (run === undefined) throw new SubjectClassifierHandoffRefusal('RUN_UNKNOWN', input.runId);
  const admissionId = SUBJECT_ROOT_SCOPE.exec(run.root_scope)?.[1];
  if (admissionId === undefined) {
    throw new SubjectClassifierHandoffRefusal(
      'RUN_NOT_SUBJECT_ROOTED',
      `run ${run.id} has root scope ${run.root_scope}; ECHE runs use classify/assemble.ts`,
    );
  }
  const completion = await checkRunCompleted(pool, run.id);
  if (completion.status !== 'COMPLETED') {
    throw new SubjectClassifierHandoffRefusal('RUN_NOT_COMPLETED', completion.status);
  }
  const admissions = await pool.query<{ subject_id: string }>(
    `SELECT subject_id FROM subject_research_admissions WHERE id = $1`,
    [admissionId],
  );
  const subjectId = admissions.rows[0]?.subject_id;
  if (subjectId === undefined) {
    throw new SubjectClassifierHandoffRefusal('ADMISSION_UNKNOWN', admissionId);
  }

  const rows = await loadEligibleRows(pool, run.id, MAX_CANDIDATES_PER_ROOT_TRACK);
  if (rows.length === 0) {
    return { kind: 'NO_CANDIDATES', subjectId, admissionId, runId: run.id };
  }

  const roots = await pool.query<{ root_key: string; requested_url: string }>(
    `SELECT DISTINCT ON (root_key) root_key, requested_url
       FROM orgunit_fetch_observations
      WHERE run_id = $1 AND discovery_method = 'ROOT'
      ORDER BY root_key, attempt_no`,
    [run.id],
  );
  const root = roots.rows[0];
  if (root === undefined || roots.rows.length !== 1 || root.root_key !== run.root_scope) {
    throw new SubjectClassifierHandoffRefusal('ROOT_UNRESOLVED', run.id);
  }
  const rootRef: SubjectRootRef = {
    rootKey: root.root_key,
    authorityKind: 'subject_admission',
    url: root.requested_url,
  };

  const pending = dedupeByResponseSha256(rows)
    .map((group) => ({ content: buildDocument(group, rootRef), group }))
    .sort((a, b) => compare(a.content.url, b.content.url));

  const base = {
    contract: SUBJECT_CLASSIFIER_HANDOFF_CONTRACT,
    subjectId,
    admissionId,
    runId: run.id,
    ruleVersion: run.rule_version,
    fetchPolicyVersion: run.fetch_policy_version,
    assemblyVersion: SUBJECT_CLASSIFIER_ASSEMBLY_VERSION,
    roots: [rootRef],
  } as const;

  const whole = finalize({ ...base, rootKey: null }, pending);
  const batches =
    pending.length <= MAX_UNIQUE_DOCUMENTS_PER_BATCH && fits(whole.batch)
      ? [whole]
      : pack({ ...base, rootKey: rootRef.rootKey }, pending);

  return {
    kind: 'BATCHES',
    subjectId,
    admissionId,
    runId: run.id,
    callStatus: SUBJECT_CLASSIFIER_CALL_STATUS,
    callBlockers: SUBJECT_CLASSIFIER_CALL_BLOCKERS,
    batches,
  };
}

interface Pending {
  readonly content: Omit<SubjectClassifierDocument, 'docIndex'>;
  readonly group: DedupedGroup;
}

function buildDocument(
  group: DedupedGroup,
  rootRef: SubjectRootRef,
): Omit<SubjectClassifierDocument, 'docIndex'> {
  const rep = group.representative;
  // A subject run is newer than canonical extraction; a v1 row here would
  // need assembly-time canonicalisation this module does not perform.
  if (rep.extractionRuleVersion === EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION) {
    throw new SubjectClassifierHandoffRefusal(
      'EXTRACTION_VERSION_UNSUPPORTED',
      rep.extractionRuleVersion,
    );
  }
  for (const key of distinctRootKeys(group)) {
    if (key !== rootRef.rootKey) throw new SubjectClassifierHandoffRefusal('ROOT_UNRESOLVED', key);
  }
  const { text: excerpt, truncated: excerptTruncated } = truncateToCodePointLimit(
    rep.mainText,
    MAX_EXCERPT_CODE_POINTS,
  );
  return {
    url: rep.url,
    title: rep.title,
    declaredLang: rep.declaredLang,
    headings: rep.headings.slice(0, MAX_HEADINGS_PER_DOCUMENT).map((h) => ({
      level: h.level,
      text: truncateToCodePointLimit(h.text, MAX_HEADING_CODE_POINTS).text,
    })),
    excerpt,
    mainTextTruncated: rep.mainTextTruncated,
    excerptTruncated,
    extractionRuleVersion: rep.extractionRuleVersion,
    discoveryMethod: rep.discoveryMethod,
    roots: [rootRef],
    trackMembership: distinctTracks(group),
    duplicateUrls: distinctUrls(group).filter((url) => url !== rep.url),
    signals: mergeSignals(group),
  };
}

/** Every subject's signals, deduped, in classify/document.ts's canonical order. */
function mergeSignals(group: DedupedGroup): readonly ClassifierSignal[] {
  const seen = new Set<string>();
  const merged: ClassifierSignal[] = [];
  for (const subject of group.subjects) {
    for (const signal of subject.signals) {
      const key = `${signal.track} ${signal.id} ${signal.field} ${signal.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(signal);
    }
  }
  return merged.sort(
    (a, b) =>
      compare(a.track, b.track) ||
      compare(a.id, b.id) ||
      compare(a.field, b.field) ||
      compare(a.kind, b.kind),
  );
}

function finalize(
  context: SubjectClassifierBatchContext,
  docs: readonly Pending[],
): AssembledSubjectBatch {
  const batch: SubjectClassifierBatch = {
    context,
    documents: docs.map((doc, index) => ({ ...doc.content, docIndex: index })),
  };
  return {
    batch,
    assemblyInputSha256: createHash('sha256').update(serialise(batch), 'utf8').digest('hex'),
    subjectsByDocIndex: new Map(
      docs.map((doc, index) => [
        index,
        doc.group.subjects.map((s) => s.candidateId).sort(compare) as readonly string[],
      ]),
    ),
    pageEvidenceIdByDocIndex: new Map(
      docs.map((doc, index) => [index, doc.group.representative.pageEvidenceId]),
    ),
  };
}

/** The exact canonical serialisation a provider request would carry. */
export function serialiseSubjectBatch(batch: SubjectClassifierBatch): string {
  return serialise(batch);
}

function serialise(batch: SubjectClassifierBatch): string {
  return canonicalStringify({ context: batch.context, documents: batch.documents });
}

function fits(batch: SubjectClassifierBatch): boolean {
  return unicodeCodePointLength(serialise(batch)) <= MAX_BATCH_PAYLOAD_CODE_POINTS;
}

/** classify/ordering.ts's deterministic greedy packer, over subject batches. */
function pack(
  context: SubjectClassifierBatchContext,
  docs: readonly Pending[],
): AssembledSubjectBatch[] {
  const out: AssembledSubjectBatch[] = [];
  let current: Pending[] = [];
  for (const doc of docs) {
    const tentative = [...current, doc];
    if (
      tentative.length <= MAX_UNIQUE_DOCUMENTS_PER_BATCH &&
      fits(finalize(context, tentative).batch)
    ) {
      current = tentative;
      continue;
    }
    if (current.length === 0) {
      throw new SubjectClassifierHandoffRefusal('PAYLOAD_BOUND_EXCEEDED', doc.content.url);
    }
    out.push(finalize(context, current));
    current = [doc];
  }
  if (current.length > 0) out.push(finalize(context, current));
  return out;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
