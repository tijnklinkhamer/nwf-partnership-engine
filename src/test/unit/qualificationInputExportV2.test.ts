/**
 * WW E-X - the v2 qualification-input export (`nwf-pe.qualification-input-export.v2`)
 * over in-memory records: v1 is embedded unchanged; OBSERVED claims are
 * NWF_SYSTEM, EXACT and linked only to page captures; proposals are a
 * separate class; researchStatus / contradictions / gaps / freshness are
 * explicit; permissions stay NONE; the output is deterministic and carries
 * no contact data, no name and no classifier output.
 */
import { describe, expect, it } from 'vitest';

import {
  buildQualificationInputExport,
  type IdentityClaimRow,
  type PageRow,
  type QualificationInputRecords,
} from '../../orgunits/qualificationInput/build.js';
import { RP_REFERENCE, WHOLE_SECOND_INSTANT } from '../../orgunits/qualificationInput/contract.js';
import {
  STRUCTURAL_GAPS,
  buildQualificationInputExportV2,
} from '../../orgunits/qualificationInputV2/build.js';
import {
  EXPORTED_CLAIM_KEYS_V2,
  LIMITATIONS_V2,
  PROPOSAL_KEYS,
  QUALIFICATION_INPUT_EXPORT_CONTRACT_V2,
  type QualificationInputExportDocumentV2,
} from '../../orgunits/qualificationInputV2/contract.js';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const SUBJECT = id(0x5001);
const ROOT_CLAIM = id(0x6001);
const ADMISSION = id(0x7001);
const RUN = id(0x8001);
const SITE = 'https://exchange-assoc.example.org/';
const NOW = '2026-10-27T12:00:00.000Z';
const EVAL = '2026-10-27T11:00:00Z';
const t = (minute: number) => `2026-10-27T09:${String(minute).padStart(2, '0')}:30.250Z`;

const website: IdentityClaimRow = {
  id: ROOT_CLAIM,
  subjectId: SUBJECT,
  claimKind: 'PUBLIC_WEBSITE',
  claimedKind: null,
  websiteUrl: SITE,
  sourceType: 'PUBLIC_URL',
  sourcePageEvidenceId: null,
  sourceWebsiteClaimId: null,
  sourceUrl: 'https://directory.example.net/assoc',
  sourceVersionRef: null,
  observedAt: '2026-10-26T08:00:00.000Z',
  claimBasis: 'SOURCE_STATED',
  createdAt: t(1),
};

function page(
  n: number,
  path: string,
  title: string,
  mainText: string,
  headings: string[] = [],
): PageRow {
  return {
    id: id(0xa000 + n),
    fetchObservationId: id(0xb000 + n),
    runId: RUN,
    rootKey: `subject_admission:${ADMISSION}`,
    requestedUrl: `${SITE}${path}`,
    observedAt: t(20 + n),
    responseSha256: `${'a'.repeat(63)}${n}`,
    title,
    headings: [{ level: 1, text: title }, ...headings.map((text) => ({ level: 2, text }))],
    mainText,
    ruleVersion: 'orgunit-extraction-v3',
    createdAt: t(20 + n),
  };
}

const RICH_PAGES: PageRow[] = [
  page(
    1,
    '',
    'International Student Association Example',
    'We are an association for international students learning Dutch.\nSubscribe to our newsletter for every event.\nFollow us on Instagram.\nRun by the board.\nQuestions? [EMAIL]',
  ),
  page(
    2,
    'welcome-week/',
    'Welcome Week',
    'Welcome Week 2024 took place on 2 September 2024.\nWelcome Week 2025 took place on 1 September 2025.\nWelcome Week 2027 starts on 30 August 2027.',
  ),
  page(3, 'events/submit/', 'Submit your event', 'Submit your event to our calendar.'),
  page(4, 'about/', 'About us', 'We are a student association. Open to all university students.'),
  page(5, 'kids/', 'Kids', 'Dutch lessons for children on Saturdays.'),
];

function records(pages: PageRow[] = RICH_PAGES): QualificationInputRecords {
  return {
    databaseNow: NOW,
    subjectId: SUBJECT,
    subject: { id: SUBJECT, createdAt: t(0) },
    identityClaims: [website],
    reviews: [
      { id: id(0xd001), targetKey: `subject:${SUBJECT}`, outcome: 'CONFIRMED', createdAt: t(5) },
    ],
    jurisdictionClaims: [],
    admissions: [
      {
        id: ADMISSION,
        subjectId: SUBJECT,
        identityClaimId: ROOT_CLAIM,
        websiteUrl: SITE,
        admittedAt: t(10),
      },
    ],
    revocations: [],
    runs: [
      {
        id: RUN,
        rootScope: `subject_admission:${ADMISSION}`,
        dryRun: false,
        completion: { terminalState: 'COMPLETED', createdAt: t(30) },
      },
    ],
    pages,
    candidates: [],
    nominations: [],
    websiteClaims: [],
  };
}

const options = { evaluatedAt: EVAL, readConsistency: 'SYNTHETIC_IN_MEMORY' as const };
const v2 = (r = records()) => buildQualificationInputExportV2(r, options);
const status = (doc: QualificationInputExportDocumentV2) =>
  Object.fromEntries(doc.researchStatus.map((s) => [s.subcriterionId, s.status]));

describe('WW E-X: the v2 export (in memory)', () => {
  it('embeds v1 unchanged: every v1 source, claim and link, the same instants and refusals', () => {
    const one = buildQualificationInputExport(records(), options);
    const two = v2();
    expect(two.document).toBe(QUALIFICATION_INPUT_EXPORT_CONTRACT_V2);
    expect(two.sources).toEqual(one.sources);
    for (const c of one.claims) expect(two.claims).toContainEqual(c);
    for (const l of one.claimLinks) expect(two.claimLinks).toContainEqual(l);
    expect([two.evaluatedAt, two.country, two.candidate, two.excluded, two.researchRuns]).toEqual([
      one.evaluatedAt,
      one.country,
      one.candidate,
      one.excluded,
      one.researchRuns,
    ]);
    expect(() =>
      buildQualificationInputExportV2(records(), {
        ...options,
        evaluatedAt: '2099-01-01T00:00:00Z',
      }),
    ).toThrow(/EVALUATED_AT_IN_THE_FUTURE/);
  });

  it('adds OBSERVED claims only: NWF_SYSTEM, EXACT, every link a page capture, every value valid', () => {
    const doc = v2();
    const added = doc.claims.filter((c) => c.basis.origin === 'C1_EXTRACTION_RULE');
    expect(new Set(added.map((c) => c.claimKey))).toEqual(
      new Set([
        'channel.existence',
        'channel.event_instances',
        'channel.cycle_history',
        'channel.resource_openness',
      ]),
    );
    // Rules v2: no claim ever rests on a sign-up SENTENCE (the organisation's statement).
    for (const c of added) {
      expect(c.basis.origin === 'C1_EXTRACTION_RULE' && c.basis.ruleIds.join()).not.toMatch(
        /NEWSLETTER_SIGNUP|DISCONTINUATION/,
      );
    }
    for (const c of doc.claims) expect(EXPORTED_CLAIM_KEYS_V2).toContain(c.claimKey);
    for (const c of added) {
      expect([c.mode, c.attribution, c.producedBy, c.evidenceClass]).toEqual([
        'OBSERVED',
        'EXACT',
        'NWF_SYSTEM',
        'RESEARCH_REAL',
      ]);
      expect(c.claimRef).toMatch(RP_REFERENCE);
      const linked = doc.claimLinks.filter((l) => l.claimRef === c.claimRef);
      expect(linked.length).toBeGreaterThan(0);
      for (const l of linked) {
        const s = doc.sources.find((x) => x.sourceRef === l.sourceRef)!;
        expect(s.record.kind).toBe('PAGE_EVIDENCE');
        expect(s.reproducibility.kind).toBe('DIGEST_ONLY_BYTES_UNAVAILABLE');
      }
    }
  });

  it('derives channels with C1 kinds only, and says how each was established', () => {
    const doc = v2();
    expect(
      doc.channels.map((c) => [c.kind, c.channelClass, c.derivation, c.establishedBy]).sort(),
    ).toEqual([
      ['MEMBER_NEWSLETTER', 'FEED', 'NAMED_ON_ADMITTED_SITE', 'PROPOSAL_ONLY'],
      ['ORIENTATION_EVENT', 'EVENT_SLOT', 'OBSERVED_ON_ADMITTED_SITE', 'OBSERVED_CLAIM'],
      ['RESOURCE_PAGE', 'STATIC', 'ADMITTED_ROOT_WEBSITE', 'OBSERVED_CLAIM'],
    ]);
    for (const c of doc.channels) {
      expect(c.channelRef).toMatch(RP_REFERENCE);
      expect(c.websiteClaimId).toBe(ROOT_CLAIM);
      expect(c.admissionIds).toEqual([ADMISSION]);
    }
  });

  it('keeps proposals a separate class with a valid value, a source, a rule and a redacted quote', () => {
    const doc = v2();
    expect(doc.proposals.length).toBeGreaterThan(5);
    for (const p of doc.proposals) {
      expect(PROPOSAL_KEYS).toContain(p.key);
      expect(p.proposalId).toMatch(/^rp-proposal:[0-9a-f-]{36}$/);
      expect(p.assertionMode).toBe('SELF_ASSERTED');
      expect(p.attribution).toBe('EXACT');
      expect(p.observedAt).toMatch(WHOLE_SECOND_INSTANT);
      expect(doc.sources.map((s) => s.sourceRef)).toContain(p.sourceRef);
      expect(p.extraction.rulesVersion).toBe('nwf-pe-c1-extraction-rules-v2');
      expect(Array.from(p.quote).length).toBeLessThanOrEqual(300);
      expect(p.quote).not.toMatch(/\[(EMAIL|PHONE)\]|@/);
      // A proposal is never also a claim.
      expect(doc.claims.map((c) => c.claimRef)).not.toContain(p.proposalId);
    }
    const keys = new Set(doc.proposals.map((p) => p.key));
    expect(keys).toEqual(
      new Set([
        'audience.cohort',
        'audience.languages',
        'audience.segment_definition',
        'candidate.kind',
        'channel.existence',
        'channel.operator_binding',
        'channel.reach_mode',
        'channel.role_based_ownership',
      ]),
    );
    // The social account named on the home page is withheld by default, and says so.
    expect(doc.gaps.map((g) => g.reason)).toContain('PROPOSAL_WITHHELD_SOCIAL_ACCOUNT_QUOTE');
    expect(doc.producerVersion).toBe('nwf-pe-qualification-input-producer-v3');
    expect(doc.extraction.rulesVersion).toBe('nwf-pe-c1-extraction-rules-v2');
  });

  it('reports research status per subcriterion, explicitly', () => {
    expect(status(v2())).toEqual({
      AF1: 'PROPOSAL_ONLY',
      AF2: 'PROPOSAL_ONLY',
      AF3: 'NOT_RESEARCHED',
      DP1: 'EVIDENCE_FOUND',
      DP2: 'PROPOSAL_ONLY',
      DP3: 'EVIDENCE_FOUND',
      DP4: 'SEARCHED_NOT_FOUND',
      AP1: 'EVIDENCE_FOUND',
      AP2: 'EVIDENCE_FOUND',
      SV1: 'EVIDENCE_FOUND',
      SV2: 'NOT_RESEARCHED',
      SV3: 'PROPOSAL_ONLY',
    });
  });

  it('lists contradictions between captures (an adult and a minor-targeted cohort)', () => {
    const doc = v2();
    expect(
      doc.contradictions.map((c) => [c.key, c.among, c.distinctValues, c.sourceRefs.length]),
    ).toEqual([['audience.cohort', 'PROPOSALS', 2, 2]]);
    // A specific kind refining a generic one is not a contradiction.
    expect(doc.contradictions.map((c) => c.key)).not.toContain('candidate.kind');
  });

  it('lists gaps explicitly: unresearched subcriteria, structural keys, unmapped findings', () => {
    const doc = v2();
    const targets = doc.gaps.map((g) => `${g.target}:${g.reason}`);
    for (const g of STRUCTURAL_GAPS) expect(targets).toContain(`${g.target}:${g.reason}`);
    expect(targets).toContain('AF3:NO_EXTRACTION_RULE_FOR_THESE_KEYS');
    expect(targets).toContain('DP4:RELEVANT_PAGE_CLASS_CAPTURED_NOTHING_FOUND');
  });

  it('gives the latest capture per key', () => {
    const fresh = Object.fromEntries(v2().freshness.map((f) => [f.key, f]));
    expect(fresh['channel.cycle_history']!.latestCapturedAt).toBe('2026-10-27T09:22:30Z');
    expect(fresh['channel.existence']!.latestCapturedAt).toBe('2026-10-27T09:25:30Z');
    for (const f of Object.values(fresh)) expect(f.latestCapturedAt).toMatch(WHOLE_SECOND_INSTANT);
  });

  it('a guarded or statement-only page adds no OBSERVED claim, and every suppression is a named gap', () => {
    const doc = v2(
      records([
        page(
          1,
          '',
          'Exchange Club Example',
          'We no longer send a newsletter, so please do not sign up.\nRegistration for the Welcome Week closes on 1 June 2025; the welcome week itself was cancelled.\nSign up for our newsletter.',
        ),
      ]),
    );
    expect(doc.claims.filter((c) => c.basis.origin === 'C1_EXTRACTION_RULE')).toEqual([]);
    const asText = (rows: unknown[][]) => rows.map((r) => JSON.stringify(r)).sort();
    expect(asText(doc.proposals.map((p) => [p.key, p.proposedValue, p.assertionMode]))).toEqual(
      asText([
        ['channel.existence', { status: 'DISCONTINUED' }, 'SELF_ASSERTED'],
        ['channel.existence', { status: 'EXISTS' }, 'SELF_ASSERTED'],
        [
          'channel.operator_binding',
          {
            operatorCandidateId: doc.candidate.candidateRef,
            basis: 'OFFICIAL_PRESENCE_NAMES_CHANNEL',
          },
          'SELF_ASSERTED',
        ],
        ['channel.reach_mode', { reach: 'PUSHED_TO_MEMBERS' }, 'SELF_ASSERTED'],
      ]),
    );
    // The two statements about the one newsletter disagree: reported, never resolved.
    expect(doc.contradictions.map((c) => [c.key, c.among])).toEqual([
      ['channel.existence', 'PROPOSALS'],
    ]);
    expect(doc.gaps.filter((g) => g.reason === 'STATEMENT_GUARDED').map((g) => g.label)).toEqual([
      'GUARD:CANCELLATION',
      'GUARD:DEADLINE',
      'GUARD:DISCONTINUATION',
      'GUARD:NEGATION',
    ]);
    expect(status(doc)['DP3']).not.toBe('EVIDENCE_FOUND');
    expect(status(doc)['SV1']).not.toBe('EVIDENCE_FOUND');
  });

  it('a sparse homepage yields almost nothing, with explicit gaps (low coverage, not low fit)', () => {
    const doc = v2(records([page(1, '', 'Buurtgroep Voorbeeld', 'Welkom op onze website.')]));
    expect(doc.proposals).toEqual([]);
    expect(doc.claims.map((c) => c.claimKey).sort()).toEqual([
      'channel.existence',
      'channel.operator_binding',
    ]);
    expect(Object.values(status(doc)).filter((s) => s === 'EVIDENCE_FOUND')).toHaveLength(2);
    expect(doc.gaps.length).toBeGreaterThanOrEqual(STRUCTURAL_GAPS.length + 8);
  });

  it('grants nothing, states its limits truthfully, carries no name and is deterministic', () => {
    const doc = v2();
    expect(Object.values(doc.permissions).every((v) => v === 'NONE' || v === 'NOT_GRANTED')).toBe(
      true,
    );
    expect(doc.permissions.contactPermission).toBe('NOT_GRANTED');
    expect(doc.limitations).toEqual(LIMITATIONS_V2);
    expect(doc.limitations.pageText).toBe(
      'NO_PAGE_TEXT_IS_EXPORTED_EXCEPT_ONE_SHORT_REDACTED_QUOTE_PER_PROPOSAL',
    );
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(
      /"(mode|assertionMode)":"INFERENCE"|"producedBy":"(CLASSIFIER|LANGUAGE_MODEL)"|\[EMAIL\]|\[PHONE\]|(cand|chn|opp):/,
    );
    expect(JSON.stringify(v2())).toBe(text);
    expect(JSON.stringify(v2(records([...RICH_PAGES].reverse())))).toBe(text);
  });
});
