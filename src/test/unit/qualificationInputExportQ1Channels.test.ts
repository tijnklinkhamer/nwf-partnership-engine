/**
 * REL Q1 item 4 - what the Operator needs to show SOURCE LINKS and SEVERAL
 * OPPORTUNITIES per subject, checked against the unchanged
 * `nwf-pe.qualification-input-export.v1` builder over in-memory records:
 *
 *   - ONE channel per admitted root website that yielded included pages (two
 *     admitted websites -> two channels; a root whose run is not completed,
 *     or whose admission is revoked, yields none);
 *   - every channel claim links only to that channel's own page sources;
 *   - every source carries an https `origin` (or null for a non-https URL,
 *     flagged SOURCE_ORIGIN_NOT_HTTPS on the claims it supports, never
 *     rewritten) and a whole-second observation instant: `capturedAt`, plus
 *     `digestRecordedAt` for a capture and `accessedAt` for a reference.
 *
 * Read-only: the export shape is not changed by this slice.
 */
import { describe, expect, it } from 'vitest';

import {
  buildQualificationInputExport,
  type IdentityClaimRow,
  type PageRow,
  type QualificationInputRecords,
} from '../../orgunits/qualificationInput/build.js';
import {
  QUALIFICATION_INPUT_EXPORT_CONTRACT,
  WHOLE_SECOND_INSTANT,
  toWholeSecond,
} from '../../orgunits/qualificationInput/contract.js';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const SUBJECT = id(0x5101);
const SITE_A = 'https://www.centro-cultural-q1-fict.mx/';
const SITE_B = 'https://idiomas.centro-cultural-q1-fict.mx/';
const SITE_C = 'https://www.taller-q1-fict.mx/';
const NOW = '2026-10-27T12:00:00.000Z';
const EVAL = '2026-10-27T11:00:00Z';
const t = (minute: number) => `2026-10-27T09:${String(minute).padStart(2, '0')}:30.250Z`;

const CLAIM = { a: id(0x6101), b: id(0x6102), c: id(0x6103) };
const ADMISSION = { a: id(0x7101), b: id(0x7102), c: id(0x7103) };
const RUN = { a: id(0x8101), b: id(0x8102), c: id(0x8103) };

function website(claimId: string, url: string, minute: number): IdentityClaimRow {
  return {
    id: claimId,
    subjectId: SUBJECT,
    claimKind: 'PUBLIC_WEBSITE',
    claimedKind: null,
    websiteUrl: url,
    sourceType: 'PUBLIC_URL',
    sourcePageEvidenceId: null,
    sourceWebsiteClaimId: null,
    sourceUrl: 'https://directorio.q1-fict.org/centro',
    sourceVersionRef: null,
    observedAt: t(1),
    claimBasis: 'SOURCE_STATED',
    createdAt: t(minute),
  };
}

function page(n: number, run: string, admission: string, url: string): PageRow {
  return {
    id: id(0xa100 + n),
    fetchObservationId: id(0xb100 + n),
    runId: run,
    rootKey: `subject_admission:${admission}`,
    requestedUrl: url,
    observedAt: t(20 + n),
    responseSha256: `${'b'.repeat(63)}${n}`,
    title: 'Centro',
    headings: [],
    mainText: 'Talleres de idiomas.',
    ruleVersion: 'orgunit-extraction-v3',
    createdAt: t(20 + n),
  };
}

function records(overrides: Partial<QualificationInputRecords> = {}): QualificationInputRecords {
  const admission = (k: 'a' | 'b' | 'c', url: string, minute: number) => ({
    id: ADMISSION[k],
    subjectId: SUBJECT,
    identityClaimId: CLAIM[k],
    websiteUrl: url,
    admittedAt: t(minute),
  });
  const run = (k: 'a' | 'b' | 'c', completed: boolean) => ({
    id: RUN[k],
    rootScope: `subject_admission:${ADMISSION[k]}`,
    dryRun: false,
    completion: completed ? { terminalState: 'COMPLETED', createdAt: t(40) } : null,
  });
  return {
    databaseNow: NOW,
    subjectId: SUBJECT,
    subject: { id: SUBJECT, createdAt: t(0) },
    identityClaims: [
      website(CLAIM.a, SITE_A, 2),
      website(CLAIM.b, SITE_B, 3),
      website(CLAIM.c, SITE_C, 4),
    ],
    reviews: [],
    jurisdictionClaims: [
      {
        id: id(0xc101),
        subjectId: SUBJECT,
        claimKind: 'COUNTRY_OF_OPERATION',
        claimedCountry: 'MX',
        claimedLegalForm: null,
        sourceType: 'PAGE_EVIDENCE',
        sourcePageEvidenceId: id(0xa101),
        sourceWebsiteClaimId: null,
        sourceUrl: null,
        sourceVersionRef: null,
        observedAt: t(21),
        claimBasis: 'SOURCE_STATED',
        recordedByActorKey: 'discovery-subjects-cli',
        createdAt: t(45),
      },
    ],
    admissions: [
      admission('a', SITE_A, 10),
      admission('b', SITE_B, 11),
      admission('c', SITE_C, 12),
    ],
    revocations: [],
    runs: [run('a', true), run('b', true), run('c', false)],
    pages: [
      page(1, RUN.a, ADMISSION.a, SITE_A),
      page(2, RUN.a, ADMISSION.a, `${SITE_A}talleres/`),
      page(3, RUN.b, ADMISSION.b, SITE_B),
      // A non-https capture under the same root: its origin is null, never rewritten.
      page(4, RUN.b, ADMISSION.b, 'http://idiomas.centro-cultural-q1-fict.mx/horario/'),
      page(5, RUN.c, ADMISSION.c, SITE_C),
    ],
    candidates: [],
    nominations: [],
    websiteClaims: [],
    ...overrides,
  };
}

const build = (r: QualificationInputRecords = records()) =>
  buildQualificationInputExport(r, { evaluatedAt: EVAL, readConsistency: 'SYNTHETIC_IN_MEMORY' });

describe('REL Q1 item 4: one channel per admitted root website, source links on every source', () => {
  it('emits one channel per admitted root website with included pages', () => {
    const doc = build();
    expect(doc.document).toBe(QUALIFICATION_INPUT_EXPORT_CONTRACT);
    expect(doc.channels).toEqual([
      {
        channelRef: `rp-channel:${CLAIM.a}`,
        kind: 'RESOURCE_PAGE',
        visibility: 'PUBLIC',
        websiteClaimId: CLAIM.a,
        admissionIds: [ADMISSION.a],
      },
      {
        channelRef: `rp-channel:${CLAIM.b}`,
        kind: 'RESOURCE_PAGE',
        visibility: 'PUBLIC',
        websiteClaimId: CLAIM.b,
        admissionIds: [ADMISSION.b],
      },
    ]);
    // The third root's run never completed: no channel, and the run is reported excluded.
    expect(doc.excluded).toContainEqual({
      ref: `research_run:${RUN.c}`,
      reason: 'RUN_NOT_COMPLETED',
    });
    expect(doc.country.value).toBe('MX');
  });

  it('links each channel claim only to its own page sources, each with an origin and an instant', () => {
    const doc = build();
    const pagesByChannel: Record<string, string[]> = {
      [`rp-channel:${CLAIM.a}`]: [SITE_A, `${SITE_A}talleres/`],
      [`rp-channel:${CLAIM.b}`]: [SITE_B, 'http://idiomas.centro-cultural-q1-fict.mx/horario/'],
    };
    for (const channel of doc.channels) {
      for (const key of ['channel.existence', 'channel.operator_binding'] as const) {
        const claim = doc.claims.find(
          (c) => c.claimKey === key && c.subject.ref === channel.channelRef,
        )!;
        expect(claim, `${channel.channelRef} ${key}`).toBeDefined();
        const sources = doc.claimLinks
          .filter((l) => l.claimRef === claim.claimRef)
          .map((l) => doc.sources.find((s) => s.sourceRef === l.sourceRef)!);
        const urls = sources.map((s) =>
          s.record.kind === 'PAGE_EVIDENCE'
            ? records().pages.find(
                (p) => p.id === (s.record as { pageEvidenceId: string }).pageEvidenceId,
              )!.requestedUrl
            : `not a page: ${s.record.kind}`,
        );
        expect(urls.sort()).toEqual([...pagesByChannel[channel.channelRef]!].sort());
      }
    }
  });

  it('gives every source an https origin (or null, flagged) and a whole-second observation instant', () => {
    const doc = build();
    expect(doc.sources).toHaveLength(4);
    for (const s of doc.sources) {
      expect(s.capturedAt).toMatch(WHOLE_SECOND_INSTANT);
      expect(s.reproducibility.kind).toBe('DIGEST_ONLY_BYTES_UNAVAILABLE');
      if (s.reproducibility.kind !== 'DIGEST_ONLY_BYTES_UNAVAILABLE') continue;
      expect(s.reproducibility.digestRecordedAt).toBe(s.capturedAt);
      expect(s.c1.contentDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(s.publisherRelation).toBe('SELF');
      const record = s.record;
      if (record.kind !== 'PAGE_EVIDENCE') throw new Error('page sources only here');
      const pageRow = records().pages.find((p) => p.id === record.pageEvidenceId)!;
      expect(s.capturedAt).toBe(toWholeSecond(pageRow.observedAt));
      if (pageRow.requestedUrl.startsWith('https://')) {
        expect(s.reproducibility.origin).toBe(pageRow.requestedUrl);
      } else {
        expect(s.reproducibility.origin).toBeNull();
      }
    }
    const flagged = doc.claims.filter((c) =>
      c.researchRealConflicts.includes('SOURCE_ORIGIN_NOT_HTTPS'),
    );
    expect(new Set(flagged.map((c) => c.subject.ref))).toEqual(new Set([`rp-channel:${CLAIM.b}`]));
  });

  it('gives a reference source an https origin and its accessedAt instant', () => {
    const doc = build(
      records({
        jurisdictionClaims: [
          {
            ...records().jurisdictionClaims[0]!,
            sourceType: 'PUBLIC_URL',
            sourcePageEvidenceId: null,
            sourceUrl: 'https://registro.q1-fict.org/centro-cultural',
            observedAt: '2026-10-26T08:15:42.999Z',
          },
        ],
      }),
    );
    const reference = doc.sources.find((s) => s.record.kind === 'PUBLIC_URL_UNRESOLVED')!;
    expect(reference.reproducibility).toEqual({
      kind: 'EXTERNAL_REFERENCE_ONLY',
      origin: 'https://registro.q1-fict.org/centro-cultural',
      accessedAt: '2026-10-26T08:15:42Z',
      contentDigest: null,
    });
    expect(reference.capturedAt).toBe('2026-10-26T08:15:42Z');
    expect(reference.publisherRelation).toBe('THIRD_PARTY');
  });

  it('drops a channel whose admission was revoked by the evaluation instant', () => {
    const doc = build(
      records({ revocations: [{ id: id(0x7201), admissionId: ADMISSION.b, revokedAt: t(50) }] }),
    );
    expect(doc.channels.map((c) => c.websiteClaimId)).toEqual([CLAIM.a]);
    expect(doc.excluded).toContainEqual({
      ref: `research_run:${RUN.b}`,
      reason: 'ADMISSION_REVOKED_BY_EVALUATED_AT',
    });
  });
});
