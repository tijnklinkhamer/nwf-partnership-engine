/**
 * PHASE 2B-2D — A3 R20: THE PURE RELATIONAL PROOF OVER LOADED ROWS.
 *
 * PURE. Every check here runs over rows already in memory, so each one is
 * unit-testable against synthetic data with no database and, crucially, with
 * no authority bypass: proving that a contaminated run refuses does not
 * require the ability to mint evidence.
 *
 * WHAT IS PROVED, AND WHAT IS DELIBERATELY NOT
 *
 *   PROVED: the run is the authorised one, non-dry, on the authority's own
 *   acquisition policy; it completed cleanly; every observation names the
 *   authority's own organisation and eche row key; every page hangs off a 2xx
 *   fetch in this run with durable bytes and a well-formed digest; every
 *   candidate hangs off a page in this run at the run's own signal rule
 *   version; and the same document under the same extraction rule version
 *   never carries two contradictory texts.
 *
 *   NOT PROVED, ON PURPOSE: that the acquisition SHOULD have succeeded. R17
 *   already carries that terminal owner authority, and re-deriving it here
 *   from row counts would quietly install a second, unapproved adjudicator.
 *   No SD9 gate runs in this file.
 *
 *   ALSO NOT DONE: no representative document is chosen, no score is reduced,
 *   no rank is read as meaning, no text is normalised, tokenised or
 *   near-deduplicated. Those belong to a later assembly slice.
 */
import { refuse } from './refusal.js';
import type {
  DurableCandidateRow,
  DurableCandidateSourceRow,
  DurableCompletionRow,
  DurableEvidenceIntegrity,
  DurableFetchObservationRow,
  DurablePageEvidenceRow,
  DurablePageEvidenceSourceRow,
  DurableRunRow,
  UnboundDurableEvidenceRequest,
  UnboundDurableRunEvidence,
} from './types.js';
import { R20_EXPECTED_CANDIDATE_TRACKS } from './types.js';
import { isLowerHexSha256, isRunRefSha256 } from './runMatch.js';

/** `numeric(8,4)` as PostgreSQL renders it, including a leading `-`. */
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return Object.freeze(out);
}

/**
 * PostgreSQL `length(text)` counts CHARACTERS (code points); JavaScript
 * `String.length` counts UTF-16 code units. Comparing the two directly would
 * report a false disagreement on any page containing an astral character, so
 * the comparison is made in code points on both sides.
 */
function codePointLength(value: string): number {
  return [...value].length;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function requireValidRequest(
  request: UnboundDurableEvidenceRequest,
): UnboundDurableEvidenceRequest {
  const problems: string[] = [];
  if (typeof request.organisationId !== 'string' || request.organisationId.length === 0) {
    problems.push('organisationId');
  }
  if (typeof request.echeRowKey !== 'string' || request.echeRowKey.length === 0) {
    problems.push('echeRowKey');
  }
  if (!isRunRefSha256(request.expectedRunRefSha256)) problems.push('expectedRunRefSha256');
  if (
    typeof request.expectedAcquisitionPolicyVersion !== 'string' ||
    request.expectedAcquisitionPolicyVersion.length === 0
  ) {
    problems.push('expectedAcquisitionPolicyVersion');
  }
  if (problems.length > 0) {
    refuse(
      'EVIDENCE_REQUEST_SHAPE_INVALID',
      `the evidence request was malformed in field(s): ${problems.join(', ')}`,
    );
  }
  return request;
}

// ---------------------------------------------------------------------------
// A. RUN AND COMPLETION.
// ---------------------------------------------------------------------------

/**
 * §18. The matched run's own configuration. The globally latest fetch policy
 * is NOT required: a historical acquisition of record is legitimate evidence,
 * and DEV_TRAIN alone spans v1, v2 and v6.
 */
export function requireMatchedRunConfiguration(
  runRows: readonly DurableRunRow[],
  request: UnboundDurableEvidenceRequest,
): DurableRunRow {
  if (runRows.length !== 1) {
    refuse(
      'AUTHORISED_RUN_ROW_NOT_UNIQUE',
      `the authorised run id selected ${runRows.length} run rows; exactly one is required`,
    );
  }
  const run = runRows[0] as DurableRunRow;
  if (run.dryRun) {
    refuse('AUTHORISED_RUN_IS_DRY_RUN', 'the authorised run is a dry run and issued no request');
  }
  if (run.fetchPolicyVersion !== request.expectedAcquisitionPolicyVersion) {
    refuse(
      'AUTHORISED_RUN_POLICY_MISMATCH',
      "the run's fetch policy version differs from the authority's acquisition policy version",
    );
  }
  if (typeof run.ruleVersion !== 'string' || run.ruleVersion.length === 0) {
    refuse('AUTHORISED_RUN_RULE_VERSION_INVALID', 'the run carries no signal rule version');
  }
  return run;
}

/** §19. Exactly one completion, COMPLETED, and clean. */
export function requireCleanCompletion(
  completionRows: readonly DurableCompletionRow[],
): DurableCompletionRow {
  if (completionRows.length === 0) {
    refuse('AUTHORISED_RUN_COMPLETION_MISSING', 'the authorised run has no terminal completion');
  }
  if (completionRows.length > 1) {
    refuse(
      'AUTHORISED_RUN_COMPLETION_NOT_UNIQUE',
      `the authorised run carries ${completionRows.length} completion rows`,
    );
  }
  const completion = completionRows[0] as DurableCompletionRow;
  if (completion.terminalState !== 'COMPLETED') {
    refuse(
      'AUTHORISED_RUN_NOT_COMPLETED',
      `a READY authority's run reached terminal state ${completion.terminalState}`,
    );
  }
  if (completion.errorKind !== null || completion.errorSummary !== null) {
    refuse('AUTHORISED_RUN_COMPLETION_CARRIES_ERROR', 'a COMPLETED run carries an error tail');
  }
  return completion;
}

// ---------------------------------------------------------------------------
// B. FETCH OBSERVATIONS.
// ---------------------------------------------------------------------------

/** §22 + §23 + §49. Identity, policy coherence and non-emptiness. */
export function requireCoherentFetchObservations(
  observations: readonly DurableFetchObservationRow[],
  run: DurableRunRow,
  request: UnboundDurableEvidenceRequest,
): readonly DurableFetchObservationRow[] {
  if (observations.length === 0) {
    refuse(
      'AUTHORISED_RUN_HAS_NO_FETCH_OBSERVATION',
      'a READY acquisition recorded no HTTP attempt at all',
    );
  }
  for (const [index, observation] of observations.entries()) {
    if (observation.runId !== run.id) {
      refuse(
        'PAGE_EVIDENCE_FETCH_OUTSIDE_RUN',
        `fetch observation at position ${index} does not belong to the authorised run`,
      );
    }
    if (
      observation.echeRowKey !== request.echeRowKey ||
      observation.organisationId !== request.organisationId
    ) {
      refuse(
        'AUTHORISED_RUN_IDENTITY_CONTAMINATION',
        `fetch observation at position ${index} names an identity other than the authority's`,
      );
    }
    if (observation.fetchPolicyVersion !== run.fetchPolicyVersion) {
      refuse(
        'AUTHORISED_RUN_FETCH_POLICY_INCOHERENT',
        `fetch observation at position ${index} carries a fetch policy version the run does not`,
      );
    }
  }
  return observations;
}

// ---------------------------------------------------------------------------
// C. PAGE EVIDENCE.
// ---------------------------------------------------------------------------

/**
 * §26 + §27. Every page is proved against its own fetch, and the document
 * identity is that fetch's `response_sha256` - never the page id, the URL,
 * the title or a hash of the extracted text.
 */
export function requireProvedPageEvidence(
  pages: readonly DurablePageEvidenceRow[],
  observations: readonly DurableFetchObservationRow[],
): readonly DurablePageEvidenceSourceRow[] {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  const proved: DurablePageEvidenceSourceRow[] = [];
  for (const [index, page] of pages.entries()) {
    const fetch = byId.get(page.fetchObservationId);
    if (fetch === undefined) {
      refuse(
        'PAGE_EVIDENCE_FETCH_OUTSIDE_RUN',
        `page evidence at position ${index} references a fetch outside the authorised run`,
      );
    }
    if (page.rootKey !== fetch.rootKey) {
      refuse(
        'PAGE_EVIDENCE_ROOT_KEY_MISMATCH',
        `page evidence at position ${index} claims a root its own fetch does not have`,
      );
    }
    if (fetch.httpStatus === null || fetch.httpStatus < 200 || fetch.httpStatus > 299) {
      refuse(
        'PAGE_EVIDENCE_OVER_NON_SUCCESS_FETCH',
        `page evidence at position ${index} hangs off a fetch that was not a 2xx response`,
      );
    }
    if (fetch.responseSha256 === null) {
      refuse(
        'PAGE_EVIDENCE_FETCH_LACKS_RESPONSE_DIGEST',
        `page evidence at position ${index} hangs off a fetch with no response digest`,
      );
    }
    if (!isLowerHexSha256(fetch.responseSha256)) {
      refuse(
        'PAGE_EVIDENCE_RESPONSE_DIGEST_MALFORMED',
        `page evidence at position ${index} hangs off a fetch whose response digest is not lower-hex sha256`,
      );
    }
    if (fetch.byteCount === null) {
      refuse(
        'PAGE_EVIDENCE_FETCH_LACKS_DURABLE_BYTES',
        `page evidence at position ${index} hangs off a fetch that recorded no byte count`,
      );
    }
    if (codePointLength(page.mainText) !== page.mainTextChars) {
      refuse(
        'PAGE_EVIDENCE_TEXT_LENGTH_DISAGREES',
        `page evidence at position ${index} disagrees with its own main_text_chars`,
      );
    }
    proved.push(
      Object.freeze({
        page,
        fetch,
        responseSha256: fetch.responseSha256,
        requestedUrl: fetch.requestedUrl,
        httpStatus: fetch.httpStatus,
      }),
    );
  }
  return Object.freeze(proved);
}

interface DocumentGrouping {
  readonly distinctResponseSha256Count: number;
  readonly duplicateDocumentSourceRowCount: number;
  readonly multipleExtractionVersionDocumentCount: number;
}

/**
 * §30 + §31 + §32. Every source row is preserved - no representative is
 * chosen and nothing is deduplicated, because a later K2 exact-document
 * reduction needs all of them. What IS enforced is that the same document
 * under the same extraction rule version never carries two different stored
 * representations: that would be a determinism failure in the extractor, and
 * choosing one of the two would hide it.
 *
 * The same document under DIFFERENT extraction rule versions is expected and
 * preserved in full. R20 does not decide which version a later slice uses.
 */
export function groupExactDocuments(
  sources: readonly DurablePageEvidenceSourceRow[],
): DocumentGrouping {
  const byDocument = new Map<string, DurablePageEvidenceSourceRow[]>();
  for (const source of sources) {
    const bucket = byDocument.get(source.responseSha256);
    if (bucket === undefined) byDocument.set(source.responseSha256, [source]);
    else bucket.push(source);
  }

  let duplicateDocumentSourceRowCount = 0;
  let multipleExtractionVersionDocumentCount = 0;

  for (const [, bucket] of byDocument) {
    if (bucket.length > 1) duplicateDocumentSourceRowCount += bucket.length;

    const byExtractionVersion = new Map<string, DurablePageEvidenceSourceRow[]>();
    for (const source of bucket) {
      const key = source.page.ruleVersion;
      const group = byExtractionVersion.get(key);
      if (group === undefined) byExtractionVersion.set(key, [source]);
      else group.push(source);
    }
    if (byExtractionVersion.size > 1) multipleExtractionVersionDocumentCount += 1;

    for (const [, group] of byExtractionVersion) {
      const first = group[0] as DurablePageEvidenceSourceRow;
      for (const other of group.slice(1)) {
        const differs =
          first.page.title !== other.page.title ||
          first.page.declaredLang !== other.page.declaredLang ||
          first.page.mainText !== other.page.mainText ||
          first.page.mainTextChars !== other.page.mainTextChars ||
          first.page.mainTextTruncated !== other.page.mainTextTruncated ||
          first.page.extractionMethod !== other.page.extractionMethod ||
          stableJson(first.page.headings) !== stableJson(other.page.headings);
        if (differs) {
          refuse(
            'DURABLE_DOCUMENT_EXTRACTION_CONFLICT',
            'one response digest carries contradictory extracted evidence under one extraction rule version',
          );
        }
      }
    }
  }

  return {
    distinctResponseSha256Count: byDocument.size,
    duplicateDocumentSourceRowCount,
    multipleExtractionVersionDocumentCount,
  };
}

// ---------------------------------------------------------------------------
// D. CANDIDATES.
// ---------------------------------------------------------------------------

/** §34 + §35 + §36 + §49. The chain, the track pair, and the exact score. */
export function requireProvedCandidates(
  candidates: readonly DurableCandidateRow[],
  pages: readonly DurablePageEvidenceSourceRow[],
  run: DurableRunRow,
): readonly DurableCandidateSourceRow[] {
  const pageById = new Map(pages.map((source) => [source.page.id, source]));
  const proved: DurableCandidateSourceRow[] = [];

  for (const [index, candidate] of candidates.entries()) {
    if (candidate.runId !== run.id) {
      refuse(
        'CANDIDATE_RUN_MISMATCH',
        `candidate at position ${index} does not belong to the authorised run`,
      );
    }
    const page = pageById.get(candidate.pageEvidenceId);
    if (page === undefined) {
      refuse(
        'CANDIDATE_PAGE_OUTSIDE_RUN',
        `candidate at position ${index} references page evidence outside the authorised run`,
      );
    }
    if (candidate.rootKey !== page.page.rootKey) {
      refuse(
        'CANDIDATE_ROOT_KEY_MISMATCH',
        `candidate at position ${index} claims a root its own page does not have`,
      );
    }
    if (candidate.ruleVersion !== run.ruleVersion) {
      refuse(
        'CANDIDATE_RULE_VERSION_INCOHERENT',
        `candidate at position ${index} carries a signal rule version the run does not`,
      );
    }
    if (
      typeof candidate.candidateScore !== 'string' ||
      !NUMERIC_RE.test(candidate.candidateScore)
    ) {
      refuse(
        'CANDIDATE_SCORE_REPRESENTATION_INVALID',
        `candidate at position ${index} does not carry an exact numeric representation`,
      );
    }
    proved.push(
      Object.freeze({
        candidate,
        pageEvidenceId: page.page.id,
        responseSha256: page.responseSha256,
      }),
    );
  }

  requireCurrentTrackPairInvariant(proved, pages);
  return Object.freeze(proved);
}

/**
 * §35. The CURRENT Generation-1 persistence contract: Phase 2B-1e writes one
 * candidate row per page per track, for Track A (`INTERNATIONAL_OFFICE`) and
 * Track B (`LANGUAGE_CENTRE`). Those names are MECHANISM labels for which
 * deterministic ranking family produced the row, never a semantic claim that
 * the page IS such a unit.
 *
 * `STUDENT_ASSOCIATION` is a third value the schema admits and the current
 * production algorithm never writes. It is NOT reinterpreted as Track A or
 * Track B: a row carrying it is a track-pair violation, and R20 refuses
 * rather than fabricating the missing track.
 */
function requireCurrentTrackPairInvariant(
  candidates: readonly DurableCandidateSourceRow[],
  pages: readonly DurablePageEvidenceSourceRow[],
): void {
  const expected = new Set<string>(R20_EXPECTED_CANDIDATE_TRACKS);
  const byPage = new Map<string, string[]>();
  for (const source of candidates) {
    const tracks = byPage.get(source.pageEvidenceId);
    if (tracks === undefined) byPage.set(source.pageEvidenceId, [source.candidate.track]);
    else tracks.push(source.candidate.track);
  }

  if (candidates.length !== pages.length * expected.size) {
    refuse(
      'CANDIDATE_TRACK_PAIR_VIOLATION',
      `the authorised run holds ${candidates.length} candidate rows over ${pages.length} page rows; ` +
        `the current contract is exactly ${expected.size} per page`,
    );
  }

  for (const page of pages) {
    const tracks = byPage.get(page.page.id) ?? [];
    const distinct = new Set(tracks);
    if (
      tracks.length !== expected.size ||
      distinct.size !== expected.size ||
      [...distinct].some((track) => !expected.has(track))
    ) {
      refuse(
        'CANDIDATE_TRACK_PAIR_VIOLATION',
        'a page in the authorised run does not carry exactly one row for each current track',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// E. THE WHOLE PROOF.
// ---------------------------------------------------------------------------

/**
 * Assembles the UNBOUND result. Every refusal above has already fired by the
 * time the integrity counts are computed, which is why the contamination,
 * policy-mismatch, orphan, conflict and track-pair counts are all zero in any
 * value this function returns: they are there so a census can ASSERT zero,
 * not so a caller can inspect a non-zero one.
 */
export function assembleUnboundDurableRunEvidence(input: {
  readonly request: UnboundDurableEvidenceRequest;
  readonly runRows: readonly DurableRunRow[];
  readonly completionRows: readonly DurableCompletionRow[];
  readonly fetchObservations: readonly DurableFetchObservationRow[];
  readonly pageEvidence: readonly DurablePageEvidenceRow[];
  readonly candidates: readonly DurableCandidateRow[];
}): UnboundDurableRunEvidence {
  const request = requireValidRequest(input.request);
  const run = requireMatchedRunConfiguration(input.runRows, request);
  const completion = requireCleanCompletion(input.completionRows);
  const fetchObservations = requireCoherentFetchObservations(input.fetchObservations, run, request);
  const pageEvidence = requireProvedPageEvidence(input.pageEvidence, fetchObservations);
  const documents = groupExactDocuments(pageEvidence);
  const candidates = requireProvedCandidates(input.candidates, pageEvidence, run);

  const integrity: DurableEvidenceIntegrity = Object.freeze({
    fetchObservationCount: fetchObservations.length,
    pageEvidenceSourceRowCount: pageEvidence.length,
    candidateRowCount: candidates.length,
    distinctResponseSha256Count: documents.distinctResponseSha256Count,
    duplicateDocumentSourceRowCount: documents.duplicateDocumentSourceRowCount,
    multipleExtractionVersionDocumentCount: documents.multipleExtractionVersionDocumentCount,
    sameDocumentSameExtractionConflictCount: 0,
    identityContaminationCount: 0,
    fetchPolicyMismatchCount: 0,
    relationalOrphanCount: 0,
    candidateTrackPairViolationCount: 0,
    extractionRuleVersionCounts: countBy(pageEvidence.map((source) => source.page.ruleVersion)),
    signalRuleVersionCounts: countBy(candidates.map((source) => source.candidate.ruleVersion)),
    candidateTrackCounts: countBy(candidates.map((source) => source.candidate.track)),
  });

  return Object.freeze({
    kind: 'UNBOUND_DURABLE_DATABASE_EVIDENCE' as const,
    request,
    run,
    completion,
    fetchObservations,
    pageEvidence,
    candidates,
    integrity,
  });
}
