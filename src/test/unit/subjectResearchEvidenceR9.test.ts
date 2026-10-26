/**
 * Global R9 - the pure subject research-evidence projection and its
 * verifier, over in-memory records (no database, no network).
 */
import { describe, expect, it } from 'vitest';

import {
  EXCERPT_CODE_POINTS,
  LIMITATIONS,
  PERMISSIONS,
  RESEARCH_EVIDENCE_CONTRACT,
  canonicalJson,
  documentDigestOf,
  projectSubjectResearchEvidence,
  sectionDigestOf,
  standingOf,
  verifySubjectResearchEvidence,
  type ResearchEvidenceResult,
} from '../../orgunits/subjectResearchEvidence/evidence.js';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ADMISSION = '9a000000-0000-4000-8000-00000000a001';
const RUN = '9a000000-0000-4000-8000-00000000b001';
const ROOT = `subject_admission:${ADMISSION}`;
const FETCH_1 = '9a000000-0000-4000-8000-00000000c001';
const FETCH_2 = '9a000000-0000-4000-8000-00000000c002';
const PAGE_1 = '9a000000-0000-4000-8000-00000000d001';
const CAND_1 = '9a000000-0000-4000-8000-00000000e001';
const CAND_2 = '9a000000-0000-4000-8000-00000000e002';
const FP = 's=3;i=7;r=0;v=3;a=3';

function records(over: Record<string, unknown> = {}): Json {
  return {
    admission: {
      id: ADMISSION,
      subjectId: '9a000000-0000-4000-8000-0000000009a1',
      websiteUrl: 'https://www.synthetic-r9-unit.example.jp/',
      policyVersion: 'subject-research-admission-policy-v1',
      identityAuthorityScope: 'TEST_ONLY',
      subjectStateDigest: 'a'.repeat(64),
      protectedRegistryDigest: 'b'.repeat(64),
      registryFingerprint: FP,
      admittedAt: '2026-10-20T10:00:00.000Z',
      expiresAt: '2026-10-27T10:00:00.000Z',
    },
    revocations: [],
    registryFingerprintAtEvaluation: FP,
    evaluatedAt: '2026-10-20T11:00:00.000Z',
    run: {
      id: RUN,
      rootScope: ROOT,
      startedAt: '2026-10-20T10:01:00.000Z',
      networkVantage: 'test',
      fetchPolicyVersion: 'orgunit-fetch-policy-v8',
      signalRuleVersion: 'orgunit-signal-rules-v1',
      dryRun: false,
    },
    completion: {
      terminalState: 'COMPLETED',
      finishedAt: '2026-10-20T10:02:00.000Z',
      errorKind: null,
    },
    fetches: [
      fetch(FETCH_2, 'https://www.synthetic-r9-unit.example.jp/', '200', '10:01:02'),
      fetch(FETCH_1, 'https://www.synthetic-r9-unit.example.jp/robots.txt', '200', '10:01:01'),
    ],
    pages: [
      {
        id: PAGE_1,
        fetchObservationId: FETCH_2,
        rootKey: ROOT,
        title: 'Synthetic circle',
        declaredLang: 'ja',
        headings: [{ level: '1', text: 'Synthetic circle' }],
        mainText: 'Language exchange. Write to [EMAIL].',
        mainTextChars: '36',
        mainTextTruncated: false,
        extractionMethod: 'MAIN_ELEMENT',
        ruleVersion: 'orgunit-extraction-v2',
        observedAt: '2026-10-20T10:01:02.000Z',
      },
    ],
    candidates: [candidate(CAND_2, 'LANGUAGE_CENTRE'), candidate(CAND_1, 'INTERNATIONAL_OFFICE')],
    ...over,
  };
}

function fetch(id: string, url: string, status: string | null, time: string): Json {
  return {
    id,
    rootKey: ROOT,
    requestedUrl: url,
    requestedHost: 'www.synthetic-r9-unit.example.jp',
    requestedRegistrableDomain: 'example.jp',
    attemptNo: '1',
    discoveryMethod: 'ROOT',
    discoveryParentUrl: null,
    httpStatus: status,
    contentType: 'text/html; charset=utf-8',
    responseSha256: 'c'.repeat(64),
    byteCount: '120',
    truncated: false,
    robotsDecision: 'ALLOWED',
    errorKind: null,
    errorSubtype: null,
    fetchPolicyVersion: 'orgunit-fetch-policy-v8',
    observedAt: `2026-10-20T${time}.000Z`,
  };
}

function candidate(id: string, track: string): Json {
  return {
    id,
    pageEvidenceId: PAGE_1,
    runId: RUN,
    rootKey: ROOT,
    track,
    typeHint: null,
    candidateScore: '2.0000',
    rankWithinRoot: '1',
    ruleVersion: 'orgunit-signal-rules-v1',
    signals: [
      {
        ruleId: 'A_INTERNATIONAL_GENERIC',
        pack: 'en',
        kind: 'positive',
        field: 'title',
        weight: '1',
      },
    ],
  };
}

const CONTEXT = {
  contract: RESEARCH_EVIDENCE_CONTRACT,
  subjectEvidenceDocumentDigest: 'd'.repeat(64),
  sourceRepository: 'nwf-partnership-engine',
  sourceRevision: null,
  readConsistency: 'SYNTHETIC_IN_MEMORY',
};

function projected(result: ResearchEvidenceResult) {
  if (result.outcome !== 'PROJECTED') throw new Error(`refused ${result.code} ${result.detail}`);
  return result;
}
const code = (r: Json, c: Json = CONTEXT) => {
  const result = projectSubjectResearchEvidence(r, c);
  return result.outcome === 'REFUSED' ? result.code : 'PROJECTED';
};

describe('R9 research evidence projection', () => {
  it('is deterministic: input order does not change a byte', () => {
    const a = projected(projectSubjectResearchEvidence(records(), CONTEXT));
    const shuffled = records();
    shuffled.fetches.reverse();
    shuffled.candidates.reverse();
    const b = projected(projectSubjectResearchEvidence(shuffled, CONTEXT));
    expect(b.canonical).toBe(a.canonical);
    expect(a.documentDigest).toBe(documentDigestOf(a.document));
    const doc = a.document as Json;
    expect(doc.fetches.map((f: Json) => f.fetchObservationId)).toEqual([FETCH_1, FETCH_2]);
    expect(doc.candidates.map((k: Json) => k.track)).toEqual([
      'INTERNATIONAL_OFFICE',
      'LANGUAGE_CENTRE',
    ]);
  });

  it('never exports the full text, a number, or a permission', () => {
    const long = records();
    long.pages[0].mainText = '𝔸'.repeat(EXCERPT_CODE_POINTS + 50);
    const doc = projected(projectSubjectResearchEvidence(long, CONTEXT)).document as Json;
    expect(Array.from(doc.pages[0].mainTextExcerpt as string)).toHaveLength(EXCERPT_CODE_POINTS);
    expect(doc.pages[0].mainTextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson(doc)).not.toMatch(/":-?[0-9]/);
    expect(doc.permissions).toEqual(PERMISSIONS);
    expect(Object.values(PERMISSIONS).every((v) => v === 'NONE')).toBe(true);
    expect(doc.limitations).toEqual(LIMITATIONS);
  });

  it.each([
    ['an ECHE-rooted run', (r: Json) => (r.run.rootScope = 'ECHE'), 'RUN_NOT_SUBJECT_ROOTED'],
    [
      "another admission's root",
      (r: Json) => (r.run.rootScope = 'subject_admission:9a000000-0000-4000-8000-00000000a0ff'),
      'RUN_NOT_SUBJECT_ROOTED',
    ],
    ['a dry run', (r: Json) => (r.run.dryRun = true), 'RUN_IS_DRY_RUN'],
    ['an unfinished run', (r: Json) => (r.completion = null), 'RUN_NOT_TERMINAL'],
    [
      'an unknown policy',
      (r: Json) => (r.admission.policyVersion = 'v2'),
      'POLICY_VERSION_UNKNOWN',
    ],
    [
      'a fetch under another root',
      (r: Json) => (r.fetches[0].rootKey = 'claim:x'),
      'EVIDENCE_INCONSISTENT',
    ],
    [
      'a page of an unlisted fetch',
      (r: Json) => (r.pages[0].fetchObservationId = '9a000000-0000-4000-8000-00000000c0ff'),
      'EVIDENCE_INCONSISTENT',
    ],
    [
      'a candidate of another run',
      (r: Json) => (r.candidates[0].runId = '9a000000-0000-4000-8000-00000000b0ff'),
      'EVIDENCE_INCONSISTENT',
    ],
    ['a duplicate fetch', (r: Json) => r.fetches.push(r.fetches[0]), 'EVIDENCE_INCONSISTENT'],
    [
      'unredacted contact text',
      (r: Json) => (r.pages[0].mainText = 'Write to someone@example.jp'),
      'CONTACT_SHAPED_TEXT',
    ],
    ['a numeric status', (r: Json) => (r.fetches[0].httpStatus = 200), 'RECORD_SHAPE_INVALID'],
    ['an extra record key', (r: Json) => (r.country = 'JP'), 'RECORD_SHAPE_INVALID'],
    [
      'too many fetches',
      (r: Json) => (r.fetches = Array.from({ length: 121 }, () => r.fetches[0])),
      'BOUND_EXCEEDED',
    ],
  ])('refuses %s', (_label, edit, expected) => {
    const r = records();
    edit(r);
    expect(code(r)).toBe(expected);
  });

  it('refuses an unbound or malformed context', () => {
    expect(code(records(), { ...CONTEXT, subjectEvidenceDocumentDigest: null })).toBe(
      'CONTEXT_SHAPE_INVALID',
    );
    expect(code(records(), { ...CONTEXT, contract: 'other' })).toBe('CONTRACT_UNKNOWN');
    expect(code(records(), { ...CONTEXT, locale: 'ja-JP' })).toBe('CONTEXT_SHAPE_INVALID');
  });
});

describe('R9 standing', () => {
  const base = {
    revocationCount: 0,
    evaluatedAt: '2026-10-20T11:00:00.000Z',
    expiresAt: '2026-10-27T10:00:00.000Z',
    admittedFingerprint: FP,
    evaluatedFingerprint: FP,
  };
  it('REVOKED > EXPIRED > STALE_REGISTRY_CHANGED > ACTIVE', () => {
    expect(standingOf(base)).toBe('ACTIVE');
    expect(standingOf({ ...base, evaluatedFingerprint: 's=4;i=7;r=0;v=3;a=3' })).toBe(
      'STALE_REGISTRY_CHANGED',
    );
    expect(standingOf({ ...base, evaluatedFingerprint: 'x', evaluatedAt: base.expiresAt })).toBe(
      'EXPIRED',
    );
    expect(standingOf({ ...base, revocationCount: 1, evaluatedAt: base.expiresAt })).toBe(
      'REVOKED',
    );
  });
});

describe('R9 verification re-derives everything from the document', () => {
  const doc = () =>
    structuredClone(projected(projectSubjectResearchEvidence(records(), CONTEXT)).document) as Json;

  it('accepts the projection', () => {
    expect(verifySubjectResearchEvidence(doc())).toMatchObject({
      state: 'CONSISTENT',
      standing: 'ACTIVE',
    });
  });

  it.each([
    ['an edited excerpt', (d: Json) => (d.pages[0].mainTextExcerpt = 'other'), 'digest_pages'],
    ['an edited rank', (d: Json) => (d.candidates[0].rankWithinRoot = '9'), 'digest_candidates'],
    ['a dropped fetch', (d: Json) => d.fetches.pop(), 'digest_fetches'],
    ['an edited summary', (d: Json) => (d.summary.pagesWithEvidence = '9'), 'summary'],
    ['a relabelled standing', (d: Json) => (d.standing.state = 'REVOKED'), 'standing'],
    [
      'an extended expiry',
      (d: Json) => (d.admission.expiresAt = '2025-01-01T00:00:00.000Z'),
      'standing',
    ],
    ['a granted permission', (d: Json) => (d.permissions.outreach = 'ALLOWED'), 'permissions'],
    ['a foreign root', (d: Json) => (d.run.rootScope = 'ECHE'), 'run_root_scope'],
  ])('refuses %s', (_label, edit, reason) => {
    const d = doc();
    edit(d);
    expect(verifySubjectResearchEvidence(d)).toEqual({ state: 'INCONSISTENT', reason });
  });

  it('a resealed edit is consistent: the document is unsigned, and says so', () => {
    const d = doc();
    d.pages[0].mainTextExcerpt = 'resealed';
    d.digests.pages = sectionDigestOf('pages', d.pages);
    expect(verifySubjectResearchEvidence(d).state).toBe('CONSISTENT');
    expect(d.limitations.documentSignature).toBe('NONE_NOT_A_SIGNED_EXPORT');
  });

  it('is total over hostile input', () => {
    for (const bad of [null, 1, 'x', [], {}, { contract: RESEARCH_EVIDENCE_CONTRACT }]) {
      expect(verifySubjectResearchEvidence(bad).state).toBe('INCONSISTENT');
    }
  });
});

describe('REL harvest H3 (ported from REL-F1-R2 Wave 2 item d): text stored before the JP phone redaction widening', () => {
  // Both phone vectors passed the fbe6a8c redaction unchanged, so an
  // orgunit-extraction-v2 row may hold them; the REL Engine integration's
  // current rules (orgunit-extraction-v3: full-width digits, bracketed area
  // codes) redact them. This lineage widened PHONE redaction only - email
  // redaction is unchanged since fbe6a8c - so a legitimately stored v2 text
  // can only be refused as PHONE-shaped; the EMAIL vector below is a
  // tampered record, used only to prove the shape naming is exact.
  const refusal = (edit: (r: Json) => void) => {
    const r = records();
    edit(r);
    const result = projectSubjectResearchEvidence(r, CONTEXT);
    if (result.outcome !== 'REFUSED') throw new Error('projected');
    return result;
  };

  it('is refused, never re-redacted, with a detail naming field, shape and stored version', () => {
    const phone = refusal((r) => (r.pages[0].mainText = 'TEL：０３－１２３４－５６７８'));
    expect(phone.code).toBe('CONTACT_SHAPED_TEXT');
    expect(phone.detail).toBe(
      'page.mainText: PHONE-shaped text under the current redaction rules ' +
        '(stored under orgunit-extraction-v2; not re-redacted, not exported)',
    );
    const bracketed = refusal((r) => (r.pages[0].headings[0].text = '電話 03(1234)5678 まで'));
    expect(bracketed.code).toBe('CONTACT_SHAPED_TEXT');
    expect(bracketed.detail).toMatch(/^page\.heading: PHONE-shaped text .*orgunit-extraction-v2/);
    const both = refusal((r) => (r.pages[0].title = 'info@example.jp ０３－１２３４－５６７８'));
    expect(both.detail).toMatch(/^page\.title: EMAIL\+PHONE-shaped text/);
  });

  it('never echoes the refused text in the detail', () => {
    for (const text of ['TEL：０３－１２３４－５６７８', '電話 03(1234)5678 まで']) {
      const result = refusal((r) => (r.pages[0].mainText = text));
      expect(result.detail).not.toMatch(/[０-９]|\d{3,}|1234/);
    }
  });

  it('the same page, stored redacted under v3, projects', () => {
    const r = records();
    r.pages[0].mainText = 'TEL：[PHONE] 電話 [PHONE] まで';
    r.pages[0].mainTextChars = String(Array.from(r.pages[0].mainText as string).length);
    r.pages[0].ruleVersion = 'orgunit-extraction-v3';
    expect(code(r)).toBe('PROJECTED');
  });
});
