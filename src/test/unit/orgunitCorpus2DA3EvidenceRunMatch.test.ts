/**
 * PHASE 2B-2D — A3 R20: THE PURE RUN MATCHER AND THE PURE RELATIONAL PROOF.
 *
 * Everything here runs with NO database and NO authority. That separation is
 * the point of the design: a contaminated run, a broken page chain and a
 * missing track must all be provable as refusals WITHOUT anything in the test
 * being able to mint durable evidence. There is therefore no `unsafeMint` for
 * these tests to reach for, and they do not need one.
 *
 * The expected digests below were computed OUTSIDE this codebase (`shasum -a
 * 256` over the exact UUID text), so a bug in `runRefSha256Of` cannot make
 * its own test pass.
 */
import { describe, expect, it } from 'vitest';
import {
  canonicaliseRunUuid,
  isLowerHexSha256,
  runRefSha256Of,
  selectAuthorisedRunId,
} from '../harness/phase2b2d/a3evidence/runMatch.js';
import {
  assembleUnboundDurableRunEvidence,
  groupExactDocuments,
  requireCleanCompletion,
  requireCoherentFetchObservations,
  requireMatchedRunConfiguration,
  requireProvedCandidates,
  requireProvedPageEvidence,
} from '../harness/phase2b2d/a3evidence/integrity.js';
import { A3EvidenceRefusal } from '../harness/phase2b2d/a3evidence/refusal.js';
import type {
  DurableCandidateRow,
  DurableCompletionRow,
  DurableFetchObservationRow,
  DurablePageEvidenceRow,
  DurableRunRow,
  UnboundDurableEvidenceRequest,
} from '../harness/phase2b2d/a3evidence/types.js';

// ---------------------------------------------------------------------------
// Independently computed fixtures.
// ---------------------------------------------------------------------------

const RUN_A = '11111111-1111-4111-8111-111111111111';
const RUN_B = '22222222-2222-4222-8222-222222222222';
const RUN_C = '33333333-3333-4333-8333-333333333333';

const SHA_RUN_A = 'bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9';
const SHA_RUN_B = 'b454f82c5857ebabf342b7258e5cf7def78b7cd975814119462973de9a38df10';
const SHA_RUN_C = 'f6222a1106eefe4f6b25302a9d963cfaba14bedfefacc2c311967e41c61cffe4';

const DOC_1 = 'a'.repeat(64);
const DOC_2 = 'b'.repeat(64);
const ORG = '99999999-9999-4999-8999-999999999999';
const ECHE = 'X TEST01|999000111';
const POLICY = 'orgunit-fetch-policy-v6';
const SIGNAL_RULES = 'orgunit-signal-rules-v1';
const EXTRACTION_RULES = 'orgunit-extraction-v1';

function refusalCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof A3EvidenceRefusal) return error.code;
    throw error;
  }
  throw new Error('expected a refusal, but none was thrown');
}

function request(
  overrides: Partial<UnboundDurableEvidenceRequest> = {},
): UnboundDurableEvidenceRequest {
  return {
    organisationId: ORG,
    echeRowKey: ECHE,
    expectedRunRefSha256: SHA_RUN_A,
    expectedAcquisitionPolicyVersion: POLICY,
    ...overrides,
  };
}

function run(overrides: Partial<DurableRunRow> = {}): DurableRunRow {
  return {
    id: RUN_A,
    startedAt: '2026-09-01T00:00:00.000Z',
    networkVantage: 'local-dev',
    fetchPolicyVersion: POLICY,
    ruleVersion: SIGNAL_RULES,
    dryRun: false,
    ...overrides,
  };
}

function completion(overrides: Partial<DurableCompletionRow> = {}): DurableCompletionRow {
  return {
    id: 'c1111111-1111-4111-8111-111111111111',
    runId: RUN_A,
    terminalState: 'COMPLETED',
    finishedAt: '2026-09-01T00:10:00.000Z',
    errorKind: null,
    errorSummary: null,
    ...overrides,
  };
}

function fetchRow(
  id: string,
  overrides: Partial<DurableFetchObservationRow> = {},
): DurableFetchObservationRow {
  return {
    id,
    runId: RUN_A,
    rootWebsiteClaimId: 'd1111111-1111-4111-8111-111111111111',
    rootPromotionId: null,
    rootKey: 'claim:d1111111-1111-4111-8111-111111111111',
    echeRowKey: ECHE,
    organisationId: ORG,
    requestedUrl: 'https://www.example.ac.uk/',
    requestedHost: 'www.example.ac.uk',
    requestedRegistrableDomain: 'example.ac.uk',
    attemptNo: 1,
    discoveryMethod: 'ROOT',
    discoveryParentUrl: null,
    httpStatus: 200,
    contentType: 'text/html',
    charset: 'utf-8',
    charsetSource: 'HTTP_HEADER',
    charsetConfidence: 'DECLARED',
    responseSha256: DOC_1,
    byteCount: 4096,
    truncated: false,
    robotsDecision: 'ALLOWED',
    robotsRule: null,
    errorKind: null,
    fetchPolicyVersion: POLICY,
    observedAt: '2026-09-01T00:01:00.000Z',
    ...overrides,
  };
}

function pageRow(
  id: string,
  fetchObservationId: string,
  overrides: Partial<DurablePageEvidenceRow> = {},
): DurablePageEvidenceRow {
  const mainText = overrides.mainText ?? 'Body text.';
  return {
    id,
    fetchObservationId,
    rootKey: 'claim:d1111111-1111-4111-8111-111111111111',
    title: 'International Office',
    declaredLang: 'en',
    headings: ['International Office'],
    mainText,
    mainTextChars: [...mainText].length,
    mainTextTruncated: false,
    extractionMethod: 'MAIN_ELEMENT',
    ruleVersion: EXTRACTION_RULES,
    observedAt: '2026-09-01T00:02:00.000Z',
    ...overrides,
    ...(overrides.mainText !== undefined && overrides.mainTextChars === undefined
      ? { mainTextChars: [...overrides.mainText].length }
      : {}),
  };
}

function candidateRow(
  id: string,
  pageEvidenceId: string,
  track: string,
  overrides: Partial<DurableCandidateRow> = {},
): DurableCandidateRow {
  return {
    id,
    pageEvidenceId,
    runId: RUN_A,
    rootKey: 'claim:d1111111-1111-4111-8111-111111111111',
    track,
    typeHint: null,
    candidateScore: '9.0000',
    signals: [],
    urlTreeParent: null,
    rankWithinRoot: 1,
    ruleVersion: SIGNAL_RULES,
    ...overrides,
  };
}

/** One page with its full current track pair. */
function pagePair(
  pageId: string,
  fetchId: string,
): {
  page: DurablePageEvidenceRow;
  candidates: DurableCandidateRow[];
} {
  return {
    page: pageRow(pageId, fetchId),
    candidates: [
      candidateRow(`${pageId}-a`, pageId, 'INTERNATIONAL_OFFICE'),
      candidateRow(`${pageId}-b`, pageId, 'LANGUAGE_CENTRE', { candidateScore: '-2.0000' }),
    ],
  };
}

// ---------------------------------------------------------------------------
// §16 / §17. THE RUN MATCHER.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: sha256(run uuid) is the only selector', () => {
  it('reproduces digests computed outside this codebase', () => {
    expect(runRefSha256Of(RUN_A)).toBe(SHA_RUN_A);
    expect(runRefSha256Of(RUN_B)).toBe(SHA_RUN_B);
    expect(runRefSha256Of(RUN_C)).toBe(SHA_RUN_C);
  });

  it('canonicalises an uppercase UUID onto the same digest', () => {
    expect(canonicaliseRunUuid(RUN_A.toUpperCase())).toBe(RUN_A);
    expect(runRefSha256Of(RUN_A.toUpperCase())).toBe(SHA_RUN_A);
  });

  it('selects exactly one matching candidate', () => {
    expect(selectAuthorisedRunId([RUN_A, RUN_B, RUN_C], SHA_RUN_B)).toBe(RUN_B);
  });

  it('refuses when nothing matches', () => {
    expect(refusalCode(() => selectAuthorisedRunId([RUN_B, RUN_C], SHA_RUN_A))).toBe(
      'AUTHORISED_RUN_NOT_FOUND',
    );
  });

  it('refuses an empty candidate set rather than returning nothing', () => {
    expect(refusalCode(() => selectAuthorisedRunId([], SHA_RUN_A))).toBe(
      'AUTHORISED_RUN_NOT_FOUND',
    );
  });

  /**
   * A run id repeated across many fetch observations is ONE run, not an
   * ambiguity. Collapsing duplicates is what makes the relational lookup in
   * §15 usable without a DISTINCT guarantee from every call site.
   */
  it('treats a repeated identical run id as one candidate', () => {
    expect(selectAuthorisedRunId([RUN_A, RUN_A, RUN_A, RUN_B], SHA_RUN_A)).toBe(RUN_A);
  });

  it('refuses a malformed UUID rather than hashing it', () => {
    expect(refusalCode(() => selectAuthorisedRunId(['not-a-uuid'], SHA_RUN_A))).toBe(
      'RUN_UUID_MALFORMED',
    );
  });

  it('refuses an expected reference that is not a sha256 digest', () => {
    expect(refusalCode(() => selectAuthorisedRunId([RUN_A], 'deadbeef'))).toBe(
      'EVIDENCE_REQUEST_SHAPE_INVALID',
    );
  });

  it('recognises lower-hex sha256 and rejects upper case or wrong length', () => {
    expect(isLowerHexSha256(DOC_1)).toBe(true);
    expect(isLowerHexSha256(DOC_1.toUpperCase())).toBe(false);
    expect(isLowerHexSha256('a'.repeat(63))).toBe(false);
  });

  /**
   * §57. A policy transition leaves the superseded run in the database. The
   * authority names the transitioned run, and nothing about recency is
   * consulted - the older run is listed FIRST here on purpose.
   */
  it('selects the transitioned run, never the superseded one', () => {
    const superseded = RUN_A;
    const transitioned = RUN_B;
    expect(selectAuthorisedRunId([superseded, transitioned], SHA_RUN_B)).toBe(transitioned);
    expect(selectAuthorisedRunId([transitioned, superseded], SHA_RUN_A)).toBe(superseded);
  });

  /**
   * §58. A slot whose primary failed and whose first reserve also failed has
   * three runs in its history. Only the digest decides.
   */
  it('selects the current reserve occupant’s run among same-slot history', () => {
    const primary = RUN_A;
    const failedReserve = RUN_B;
    const currentReserve = RUN_C;
    expect(selectAuthorisedRunId([primary, failedReserve, currentReserve], SHA_RUN_C)).toBe(
      currentReserve,
    );
  });
});

// ---------------------------------------------------------------------------
// §18 / §19. RUN CONFIGURATION AND COMPLETION.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: the matched run’s own configuration', () => {
  it('accepts a historical acquisition policy, not only the newest', () => {
    for (const version of ['orgunit-fetch-policy-v1', 'orgunit-fetch-policy-v2', POLICY]) {
      const matched = requireMatchedRunConfiguration(
        [run({ fetchPolicyVersion: version })],
        request({ expectedAcquisitionPolicyVersion: version }),
      );
      expect(matched.fetchPolicyVersion).toBe(version);
    }
  });

  it('refuses a dry run', () => {
    expect(
      refusalCode(() => requireMatchedRunConfiguration([run({ dryRun: true })], request())),
    ).toBe('AUTHORISED_RUN_IS_DRY_RUN');
  });

  it('refuses a run whose policy differs from the authority’s', () => {
    expect(
      refusalCode(() =>
        requireMatchedRunConfiguration(
          [run({ fetchPolicyVersion: 'orgunit-fetch-policy-v1' })],
          request(),
        ),
      ),
    ).toBe('AUTHORISED_RUN_POLICY_MISMATCH');
  });

  it('refuses a run carrying no signal rule version', () => {
    expect(
      refusalCode(() => requireMatchedRunConfiguration([run({ ruleVersion: '' })], request())),
    ).toBe('AUTHORISED_RUN_RULE_VERSION_INVALID');
  });

  it('refuses zero or several run rows for one id', () => {
    expect(refusalCode(() => requireMatchedRunConfiguration([], request()))).toBe(
      'AUTHORISED_RUN_ROW_NOT_UNIQUE',
    );
    expect(refusalCode(() => requireMatchedRunConfiguration([run(), run()], request()))).toBe(
      'AUTHORISED_RUN_ROW_NOT_UNIQUE',
    );
  });
});

describe('2D-A3 R20: completion', () => {
  it('accepts exactly one clean COMPLETED row', () => {
    expect(requireCleanCompletion([completion()]).terminalState).toBe('COMPLETED');
  });

  it('refuses a missing or duplicated completion', () => {
    expect(refusalCode(() => requireCleanCompletion([]))).toBe('AUTHORISED_RUN_COMPLETION_MISSING');
    expect(refusalCode(() => requireCleanCompletion([completion(), completion()]))).toBe(
      'AUTHORISED_RUN_COMPLETION_NOT_UNIQUE',
    );
  });

  it('refuses a FAILED or ABORTED run behind a READY authority', () => {
    for (const state of ['FAILED', 'ABORTED']) {
      expect(
        refusalCode(() =>
          requireCleanCompletion([completion({ terminalState: state, errorKind: 'OTHER' })]),
        ),
      ).toBe('AUTHORISED_RUN_NOT_COMPLETED');
    }
  });

  it('refuses a COMPLETED row carrying an error tail', () => {
    expect(refusalCode(() => requireCleanCompletion([completion({ errorKind: 'OTHER' })]))).toBe(
      'AUTHORISED_RUN_COMPLETION_CARRIES_ERROR',
    );
  });
});

// ---------------------------------------------------------------------------
// §22 / §23 / §59. IDENTITY AND POLICY.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: one run, one identity', () => {
  it('accepts observations that all share the authority’s identity', () => {
    const observations = [fetchRow('f1'), fetchRow('f2')];
    expect(requireCoherentFetchObservations(observations, run(), request())).toHaveLength(2);
  });

  it('refuses a single observation naming another organisation', () => {
    const observations = [
      fetchRow('f1'),
      fetchRow('f2', { organisationId: '88888888-8888-4888-8888-888888888888' }),
    ];
    expect(
      refusalCode(() => requireCoherentFetchObservations(observations, run(), request())),
    ).toBe('AUTHORISED_RUN_IDENTITY_CONTAMINATION');
  });

  it('refuses a single observation naming another eche row key', () => {
    const observations = [fetchRow('f1'), fetchRow('f2', { echeRowKey: 'Y OTHER02|111000999' })];
    expect(
      refusalCode(() => requireCoherentFetchObservations(observations, run(), request())),
    ).toBe('AUTHORISED_RUN_IDENTITY_CONTAMINATION');
  });

  it('refuses a NULL organisation id, which is not the authority’s identity', () => {
    const observations = [fetchRow('f1', { organisationId: null })];
    expect(
      refusalCode(() => requireCoherentFetchObservations(observations, run(), request())),
    ).toBe('AUTHORISED_RUN_IDENTITY_CONTAMINATION');
  });

  it('refuses a mixed fetch policy inside one run', () => {
    const observations = [
      fetchRow('f1'),
      fetchRow('f2', { fetchPolicyVersion: 'orgunit-fetch-policy-v1' }),
    ];
    expect(
      refusalCode(() => requireCoherentFetchObservations(observations, run(), request())),
    ).toBe('AUTHORISED_RUN_FETCH_POLICY_INCOHERENT');
  });

  it('refuses a READY acquisition that recorded no attempt at all', () => {
    expect(refusalCode(() => requireCoherentFetchObservations([], run(), request()))).toBe(
      'AUTHORISED_RUN_HAS_NO_FETCH_OBSERVATION',
    );
  });
});

// ---------------------------------------------------------------------------
// §26 / §27 / §60. THE PAGE RELATION.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: a page is proved through its own fetch', () => {
  const observations = [fetchRow('f1')];

  it('carries the fetch’s response digest as the document identity', () => {
    const proved = requireProvedPageEvidence([pageRow('p1', 'f1')], observations);
    expect(proved[0]?.responseSha256).toBe(DOC_1);
    expect(proved[0]?.requestedUrl).toBe('https://www.example.ac.uk/');
  });

  it('refuses a page whose fetch is outside the run', () => {
    expect(
      refusalCode(() => requireProvedPageEvidence([pageRow('p1', 'other')], observations)),
    ).toBe('PAGE_EVIDENCE_FETCH_OUTSIDE_RUN');
  });

  it('refuses a root key the page’s own fetch does not have', () => {
    expect(
      refusalCode(() =>
        requireProvedPageEvidence([pageRow('p1', 'f1', { rootKey: 'claim:other' })], observations),
      ),
    ).toBe('PAGE_EVIDENCE_ROOT_KEY_MISMATCH');
  });

  it('refuses a page over a non-2xx fetch', () => {
    for (const status of [301, 404, 500]) {
      expect(
        refusalCode(() =>
          requireProvedPageEvidence(
            [pageRow('p1', 'f1')],
            [fetchRow('f1', { httpStatus: status })],
          ),
        ),
      ).toBe('PAGE_EVIDENCE_OVER_NON_SUCCESS_FETCH');
    }
  });

  it('refuses a page over a fetch with no response digest', () => {
    expect(
      refusalCode(() =>
        requireProvedPageEvidence(
          [pageRow('p1', 'f1')],
          [fetchRow('f1', { responseSha256: null, byteCount: null })],
        ),
      ),
    ).toBe('PAGE_EVIDENCE_FETCH_LACKS_RESPONSE_DIGEST');
  });

  it('refuses a malformed response digest', () => {
    expect(
      refusalCode(() =>
        requireProvedPageEvidence(
          [pageRow('p1', 'f1')],
          [fetchRow('f1', { responseSha256: DOC_1.toUpperCase() })],
        ),
      ),
    ).toBe('PAGE_EVIDENCE_RESPONSE_DIGEST_MALFORMED');
  });

  it('refuses a page over a fetch that recorded no bytes', () => {
    expect(
      refusalCode(() =>
        requireProvedPageEvidence([pageRow('p1', 'f1')], [fetchRow('f1', { byteCount: null })]),
      ),
    ).toBe('PAGE_EVIDENCE_FETCH_LACKS_DURABLE_BYTES');
  });

  it('refuses returned data whose text disagrees with main_text_chars', () => {
    expect(
      refusalCode(() =>
        requireProvedPageEvidence(
          [pageRow('p1', 'f1', { mainText: 'abc', mainTextChars: 99 })],
          observations,
        ),
      ),
    ).toBe('PAGE_EVIDENCE_TEXT_LENGTH_DISAGREES');
  });

  /**
   * PostgreSQL counts characters; JavaScript counts UTF-16 code units. A page
   * of astral characters is the case where a naive comparison would report a
   * false conflict, so it is pinned.
   */
  it('counts text in code points, so an astral page is not a false disagreement', () => {
    const astral = '😀😀😀';
    expect(astral.length).toBe(6);
    const proved = requireProvedPageEvidence(
      [pageRow('p1', 'f1', { mainText: astral, mainTextChars: 3 })],
      observations,
    );
    expect(proved).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §30 / §31 / §32 / §61. THE EXACT DOCUMENT.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: the same response digest across several source rows', () => {
  const observations = [
    fetchRow('f1', { requestedUrl: 'https://www.example.ac.uk/a' }),
    fetchRow('f2', { requestedUrl: 'https://www.example.ac.uk/b' }),
  ];

  it('A. same digest, same extraction version, same text: both rows preserved', () => {
    const proved = requireProvedPageEvidence(
      [pageRow('p1', 'f1'), pageRow('p2', 'f2')],
      observations,
    );
    const grouping = groupExactDocuments(proved);
    expect(proved).toHaveLength(2);
    expect(grouping.distinctResponseSha256Count).toBe(1);
    expect(grouping.duplicateDocumentSourceRowCount).toBe(2);
    expect(grouping.multipleExtractionVersionDocumentCount).toBe(0);
  });

  it('B. same digest, same extraction version, different text: refused', () => {
    const proved = requireProvedPageEvidence(
      [pageRow('p1', 'f1', { mainText: 'one' }), pageRow('p2', 'f2', { mainText: 'two' })],
      observations,
    );
    expect(refusalCode(() => groupExactDocuments(proved))).toBe(
      'DURABLE_DOCUMENT_EXTRACTION_CONFLICT',
    );
  });

  it('B. a differing title, heading set or declared language is also a conflict', () => {
    for (const override of [
      { title: 'Other' },
      { headings: ['Other'] },
      { declaredLang: 'fr' },
      { extractionMethod: 'FULL_BODY' },
      { mainTextTruncated: true },
    ]) {
      const proved = requireProvedPageEvidence(
        [pageRow('p1', 'f1'), pageRow('p2', 'f2', override)],
        observations,
      );
      expect(refusalCode(() => groupExactDocuments(proved))).toBe(
        'DURABLE_DOCUMENT_EXTRACTION_CONFLICT',
      );
    }
  });

  it('C. same digest, different extraction versions: preserved, never reduced', () => {
    const proved = requireProvedPageEvidence(
      [
        pageRow('p1', 'f1', { mainText: 'one' }),
        pageRow('p2', 'f2', { mainText: 'two', ruleVersion: 'orgunit-extraction-v2' }),
      ],
      observations,
    );
    const grouping = groupExactDocuments(proved);
    expect(proved).toHaveLength(2);
    expect(grouping.distinctResponseSha256Count).toBe(1);
    expect(grouping.multipleExtractionVersionDocumentCount).toBe(1);
  });

  it('counts distinct documents without ranking, capping or selecting any', () => {
    const proved = requireProvedPageEvidence(
      [pageRow('p1', 'f1'), pageRow('p2', 'f2')],
      [fetchRow('f1'), fetchRow('f2', { responseSha256: DOC_2 })],
    );
    const grouping = groupExactDocuments(proved);
    expect(grouping.distinctResponseSha256Count).toBe(2);
    expect(grouping.duplicateDocumentSourceRowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §34 / §35 / §36 / §62. CANDIDATES.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: a candidate is proved through its page', () => {
  const observations = [fetchRow('f1')];
  const pair = pagePair('p1', 'f1');
  const pages = requireProvedPageEvidence([pair.page], observations);

  it('accepts the current Track A / Track B pair and preserves a negative score', () => {
    const proved = requireProvedCandidates(pair.candidates, pages, run());
    expect(proved).toHaveLength(2);
    expect(proved.map((entry) => entry.candidate.candidateScore).sort()).toEqual([
      '-2.0000',
      '9.0000',
    ]);
    expect(proved.every((entry) => entry.responseSha256 === DOC_1)).toBe(true);
  });

  it('refuses a candidate belonging to another run', () => {
    const candidates = [
      pair.candidates[0] as DurableCandidateRow,
      { ...(pair.candidates[1] as DurableCandidateRow), runId: RUN_B },
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_RUN_MISMATCH',
    );
  });

  it('refuses a candidate whose page is outside the run', () => {
    const candidates = [
      pair.candidates[0] as DurableCandidateRow,
      { ...(pair.candidates[1] as DurableCandidateRow), pageEvidenceId: 'elsewhere' },
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_PAGE_OUTSIDE_RUN',
    );
  });

  it('refuses a candidate claiming a root its page does not have', () => {
    const candidates = [
      pair.candidates[0] as DurableCandidateRow,
      { ...(pair.candidates[1] as DurableCandidateRow), rootKey: 'claim:other' },
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_ROOT_KEY_MISMATCH',
    );
  });

  it('refuses a candidate rule version the run does not carry', () => {
    const candidates = [
      pair.candidates[0] as DurableCandidateRow,
      { ...(pair.candidates[1] as DurableCandidateRow), ruleVersion: 'orgunit-signal-rules-v2' },
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_RULE_VERSION_INCOHERENT',
    );
  });

  it('refuses a score that is not an exact numeric representation', () => {
    const candidates = [
      pair.candidates[0] as DurableCandidateRow,
      { ...(pair.candidates[1] as DurableCandidateRow), candidateScore: 'NaN' },
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_SCORE_REPRESENTATION_INVALID',
    );
  });

  it('refuses a missing Track A row', () => {
    const candidates = [candidateRow('x', 'p1', 'LANGUAGE_CENTRE')];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_TRACK_PAIR_VIOLATION',
    );
  });

  it('refuses a missing Track B row', () => {
    const candidates = [candidateRow('x', 'p1', 'INTERNATIONAL_OFFICE')];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_TRACK_PAIR_VIOLATION',
    );
  });

  it('refuses a duplicated track instead of accepting two of a kind', () => {
    const candidates = [
      candidateRow('x', 'p1', 'INTERNATIONAL_OFFICE'),
      candidateRow('y', 'p1', 'INTERNATIONAL_OFFICE'),
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_TRACK_PAIR_VIOLATION',
    );
  });

  /**
   * §35. `STUDENT_ASSOCIATION` is a value the schema admits and the current
   * production algorithm never writes. R20 refuses rather than reading it as
   * Track A or Track B - fabricating the missing track is exactly the kind of
   * quiet repair this layer exists to avoid.
   */
  it('never reinterprets STUDENT_ASSOCIATION as Track A or Track B', () => {
    const candidates = [
      candidateRow('x', 'p1', 'INTERNATIONAL_OFFICE'),
      candidateRow('y', 'p1', 'STUDENT_ASSOCIATION'),
    ];
    expect(refusalCode(() => requireProvedCandidates(candidates, pages, run()))).toBe(
      'CANDIDATE_TRACK_PAIR_VIOLATION',
    );
  });
});

// ---------------------------------------------------------------------------
// §39 / §49. THE WHOLE UNBOUND ASSEMBLY.
// ---------------------------------------------------------------------------

describe('2D-A3 R20: the assembled unbound evidence', () => {
  function completeInput() {
    const first = pagePair('p1', 'f1');
    const second = pagePair('p2', 'f2');
    return {
      request: request(),
      runRows: [run()],
      completionRows: [completion()],
      fetchObservations: [fetchRow('f1'), fetchRow('f2', { responseSha256: DOC_2 })],
      pageEvidence: [first.page, second.page],
      candidates: [...first.candidates, ...second.candidates],
    };
  }

  it('assembles, and reports zero on every refusable integrity measure', () => {
    const evidence = assembleUnboundDurableRunEvidence(completeInput());
    expect(evidence.kind).toBe('UNBOUND_DURABLE_DATABASE_EVIDENCE');
    expect(evidence.integrity).toMatchObject({
      fetchObservationCount: 2,
      pageEvidenceSourceRowCount: 2,
      candidateRowCount: 4,
      distinctResponseSha256Count: 2,
      duplicateDocumentSourceRowCount: 0,
      multipleExtractionVersionDocumentCount: 0,
      sameDocumentSameExtractionConflictCount: 0,
      identityContaminationCount: 0,
      fetchPolicyMismatchCount: 0,
      relationalOrphanCount: 0,
      candidateTrackPairViolationCount: 0,
    });
    expect(evidence.integrity.candidateTrackCounts).toEqual({
      INTERNATIONAL_OFFICE: 2,
      LANGUAGE_CENTRE: 2,
    });
    expect(evidence.integrity.extractionRuleVersionCounts).toEqual({ [EXTRACTION_RULES]: 2 });
    expect(evidence.integrity.signalRuleVersionCounts).toEqual({ [SIGNAL_RULES]: 4 });
  });

  it('holds the current invariant: candidate rows = 2 x page rows', () => {
    const evidence = assembleUnboundDurableRunEvidence(completeInput());
    expect(evidence.integrity.candidateRowCount).toBe(
      2 * evidence.integrity.pageEvidenceSourceRowCount,
    );
  });

  it('is not branded authority, and says so in its own kind', () => {
    const evidence = assembleUnboundDurableRunEvidence(completeInput());
    expect(evidence.kind).not.toBe('A3_DURABLE_ACQUISITION_EVIDENCE');
  });

  it('refuses a malformed request before anything else', () => {
    expect(
      refusalCode(() =>
        assembleUnboundDurableRunEvidence({
          ...completeInput(),
          request: request({ expectedRunRefSha256: 'short' }),
        }),
      ),
    ).toBe('EVIDENCE_REQUEST_SHAPE_INVALID');
    expect(
      refusalCode(() =>
        assembleUnboundDurableRunEvidence({
          ...completeInput(),
          request: request({ organisationId: '' }),
        }),
      ),
    ).toBe('EVIDENCE_REQUEST_SHAPE_INVALID');
  });

  it('refuses an orphan candidate row rather than dropping it', () => {
    const input = completeInput();
    expect(
      refusalCode(() =>
        assembleUnboundDurableRunEvidence({
          ...input,
          candidates: [...input.candidates, candidateRow('z', 'ghost', 'INTERNATIONAL_OFFICE')],
        }),
      ),
    ).toBe('CANDIDATE_PAGE_OUTSIDE_RUN');
  });

  it('refuses an orphan page row rather than dropping it', () => {
    const input = completeInput();
    expect(
      refusalCode(() =>
        assembleUnboundDurableRunEvidence({
          ...input,
          pageEvidence: [...input.pageEvidence, pageRow('p3', 'ghost')],
        }),
      ),
    ).toBe('PAGE_EVIDENCE_FETCH_OUTSIDE_RUN');
  });
});
