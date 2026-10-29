/**
 * V7.2 PRECISION REPAIR — SYNTHETIC SEMANTIC FIXTURES (DETERMINISTIC ONLY).
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. Every fixture below is SYNTHETIC
 * text about fictional organisations: "Lakeside Training Centre" (a small,
 * non-university adult-education centre), "Brightwater Language School" (a
 * small language school) and "Northbridge Institute" (a larger
 * institution). None is copied from a real page, and none comes from
 * DEV_CONFIRM, FINAL_HOLDOUT, PARIS520 or any other protected evaluation
 * document or label. The shapes are modelled on the V7-C1 comparison (a
 * small organisation's general "About us" overview promoted to UNIT_PAGE
 * through the whole-organisation allowance, and the genuine mobility page
 * kept under it). Those examples guided development, so they are NOT an
 * independent acceptance set.
 *
 * The tests prove three things only:
 *   (a) the label v7.2 intends for each fixture is EXPRESSIBLE under the
 *       unchanged output schema v2 and passes the unchanged deterministic
 *       validator;
 *   (b) the deterministic validator is semantics-blind by design: the V7-C1
 *       error shape and quotes that are exact but do not support the claim
 *       still validate, so semantic support lives in the prompt only;
 *   (c) the v7.2 prompt carries the rule clause each fixture depends on.
 *
 * PASSING MOCKED TESTS DO NOT PROVE BETTER REAL-MODEL CLASSIFICATION. No
 * model is called here; whether the model follows v7.2 is unproven until an
 * OWNER-approved live comparison.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { describe, expect, it } from 'vitest';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import {
  ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  PAGE_KINDS,
} from '../../orgunits/classify/outputSchema.js';
import { validateClassifierResponse } from '../../orgunits/classify/validate.js';
import type {
  ClassifierBatch,
  ClassifierDocument,
  Heading,
} from '../../orgunits/classify/types.js';

type Tri = 'YES' | 'NO' | 'UNKNOWN';
type Span = {
  readonly source: 'TITLE' | 'HEADING' | 'EXCERPT' | 'URL_PATH';
  readonly quote: string;
};

function rootOf(host: string) {
  return {
    rootKey: `claim:synthetic-${host}`,
    authorityKind: 'claim' as const,
    url: `https://${host}/`,
  };
}

function docOn(host: string) {
  const root = rootOf(host);
  return (
    docIndex: number,
    path: string,
    title: string,
    headings: readonly string[],
    excerptLines: readonly string[],
  ): ClassifierDocument => ({
    docIndex,
    url: `https://${host}${path}`,
    title,
    declaredLang: 'en',
    headings: headings.map((text, i): Heading => ({ level: i === 0 ? 1 : 2, text })),
    excerpt: excerptLines.join('\n'),
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v2',
    discoveryMethod: 'LINK',
    roots: [root],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
  });
}

function batchOf(
  host: string,
  organisationName: string,
  documents: readonly ClassifierDocument[],
): ClassifierBatch {
  return {
    context: {
      organisationName,
      echeRowKey: 'synthetic-row',
      countryCode: 'XX',
      runId: '00000000-0000-4000-8000-000000000000',
      ruleVersion: 'synthetic',
      fetchPolicyVersion: 'synthetic',
      assemblyVersion: 'orgunit-classifier-assembly-v2',
      rootKey: null,
      roots: [rootOf(host)],
    },
    documents,
  };
}

function unitPage(
  docIndex: number,
  unitName: string | null,
  axes: readonly [Tri, Tri, Tri],
  spans: readonly Span[],
  unitType = 'INTERNATIONAL_MOBILITY_OFFICE',
) {
  return {
    doc_index: docIndex,
    verdict: 'UNIT_PAGE',
    unit_type: unitType,
    page_kind: null,
    unit_name: unitName,
    serves_incoming_international_students: axes[0],
    serves_outgoing_mobility_students: axes[1],
    provides_language_learning_or_support: axes[2],
    confidence: 'HIGH',
    rationale: 'Synthetic fixture: the intended v7.2 label.',
    evidence_spans: spans,
  };
}

function notAUnit(docIndex: number, pageKind: string, spans: readonly Span[]) {
  return {
    doc_index: docIndex,
    verdict: 'NOT_A_UNIT',
    unit_type: null,
    page_kind: pageKind,
    unit_name: null,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
    confidence: 'HIGH',
    rationale: 'Synthetic fixture: the intended v7.2 label.',
    evidence_spans: spans,
  };
}

// --- Small organisation: Lakeside Training Centre (allowance eligible) ------

const lakeside = docOn('lakeside.example');

/** Case 1. Modelled on the V7-C1 false positive: a general overview whose one capability is a list item. */
const SMALL_ABOUT_US_GENERAL = lakeside(
  0,
  '/about-us/',
  'About us - Lakeside Training Centre',
  ['About us', 'Location'],
  [
    'About us',
    'We are a fully accredited private training centre committed to quality and to our learners.',
    'Lakeside Training Centre was founded in the early nineties to meet local demand for skills.',
    'We run vocational and higher vocational programmes for adults at two locations.',
    'We offer language, computer, painting and bookkeeping courses.',
    'We take part in many national and international projects.',
    'We believe every learner is a special individual and deserves personal support.',
    'Director:',
  ],
);

/** Case 4. A genuine mobility page under the allowance: the organisation's own mobility operation, described. */
const SMALL_MOBILITY = lakeside(
  1,
  '/mobility/',
  'Mobility - Lakeside Training Centre',
  ['Mobility', 'Erasmus charter', 'Taking part'],
  [
    'Mobility',
    'As a small centre we organise traineeships abroad for our students, staff and teachers.',
    'We select participants, arrange host companies with partner institutions and prepare each trainee before departure.',
    'Our Erasmus charter allows these mobility activities in higher vocational education.',
    'Students who want to take part apply to us at the start of each semester.',
  ],
);

/** Case 5. A general institutional homepage. */
const SMALL_HOMEPAGE = lakeside(
  2,
  '/',
  'Lakeside Training Centre - Adult and vocational education',
  ['A new opportunity', 'Latest news', 'What our learners say'],
  [
    'Bookkeeping technician',
    'Retail assistant',
    'Higher vocational programme in logistics',
    'A new opportunity',
    'Success follows effort, often more than you expect.',
  ],
);

/** A testimonial: NOT_A_UNIT with the page_kind of its own subject (OTHER_NON_UNIT is a valid schema value). */
const SMALL_TESTIMONIAL = lakeside(
  3,
  '/testimonials/anna/',
  'Anna - Lakeside Training Centre',
  ['Anna'],
  [
    'Taking part in a traineeship abroad was one of my best decisions.',
    'I also learned a lot of the local language while I was there.',
  ],
);

const LAKESIDE_DOCS = [
  SMALL_ABOUT_US_GENERAL,
  SMALL_MOBILITY,
  SMALL_HOMEPAGE,
  SMALL_TESTIMONIAL,
] as const;
const LAKESIDE = batchOf('lakeside.example', 'Lakeside Training Centre (synthetic)', LAKESIDE_DOCS);

const LAKESIDE_INTENDED = [
  notAUnit(0, 'GENERIC_INSTITUTIONAL_PAGE', [
    { source: 'TITLE', quote: 'About us - Lakeside Training Centre' },
    {
      source: 'EXCERPT',
      quote: 'We run vocational and higher vocational programmes for adults at two locations.',
    },
  ]),
  unitPage(
    1,
    'Lakeside Training Centre',
    ['UNKNOWN', 'YES', 'UNKNOWN'],
    [
      { source: 'HEADING', quote: 'Mobility' },
      {
        source: 'EXCERPT',
        quote:
          'As a small centre we organise traineeships abroad for our students, staff and teachers.',
      },
    ],
  ),
  notAUnit(2, 'NAVIGATION_OR_LANDING_PAGE', [
    { source: 'TITLE', quote: 'Lakeside Training Centre - Adult and vocational education' },
  ]),
  notAUnit(3, 'OTHER_NON_UNIT', [
    {
      source: 'EXCERPT',
      quote: 'Taking part in a traineeship abroad was one of my best decisions.',
    },
  ]),
] as const;

// --- Small language school: an "About us" page that IS its service description

const brightwater = docOn('brightwater.example');

/** Case 2. A small organisation's "About us" page that genuinely serves as its dedicated service description. */
const SMALL_ABOUT_US_SERVICE = brightwater(
  0,
  '/about-us/',
  'About us - Brightwater Language School',
  ['About us', 'Our courses', 'Who we teach', 'How to enrol'],
  [
    'Brightwater Language School teaches English and German to adults and to international students.',
    'Courses run at six levels, from beginner to advanced, in groups of at most ten learners.',
    'Every new learner takes a placement test and meets a teacher before joining a group.',
    'We help international students who arrive for our courses to find accommodation.',
    'Enrol at the front desk or by email.',
  ],
);

const BRIGHTWATER = batchOf('brightwater.example', 'Brightwater Language School (synthetic)', [
  SMALL_ABOUT_US_SERVICE,
]);

const BRIGHTWATER_INTENDED = [
  unitPage(
    0,
    'Brightwater Language School',
    ['YES', 'UNKNOWN', 'YES'],
    [
      { source: 'TITLE', quote: 'About us - Brightwater Language School' },
      {
        source: 'EXCERPT',
        quote:
          'Brightwater Language School teaches English and German to adults and to international students.',
      },
      {
        source: 'EXCERPT',
        quote: 'We help international students who arrive for our courses to find accommodation.',
      },
    ],
    'LANGUAGE_CENTRE',
  ),
] as const;

// --- Larger institution: Northbridge Institute (allowance does NOT apply) ---

const northbridge = docOn('northbridge.example');

/** Case 3. A dedicated international office. */
const INTL_OFFICE = northbridge(
  0,
  '/international-office/',
  'International Office - Northbridge Institute',
  ['International Office', 'Contact'],
  [
    'The International Office cooperates with partner institutions abroad and prepares exchange agreements.',
    'The office advises incoming exchange students on enrolment and housing.',
    'The office selects and prepares outgoing students for their semester abroad.',
    'Contact: [EMAIL]',
  ],
);

/** Case 6. A hub with unit teasers but no dedicated unit description. */
const HUB = northbridge(
  1,
  '/international/',
  'International - Northbridge Institute',
  ['International', 'International Office', 'Language Centre', 'Welcome Desk'],
  [
    'Northbridge Institute welcomes students from all over the world.',
    'The International Office manages our partnerships. [...]',
    'Read more',
    'The Language Centre offers courses in many languages. [...]',
    'Read more',
    'The Welcome Desk helps you settle in. [...]',
    'Read more',
  ],
);

/** Case 7. Institution-level versus unit-level attribution: the institution's courses are not this desk's. */
const WELCOME_DESK = northbridge(
  2,
  '/welcome-desk/',
  'Welcome Desk - Northbridge Institute',
  ['Welcome Desk'],
  [
    'The Welcome Desk helps every international student settle in during the first weeks.',
    'Northbridge Institute offers language courses to all of its students.',
  ],
);

/** Case 8. Another unit provides language courses; the target unit's own role is unknown. */
const RELATIONS_DEPT = northbridge(
  3,
  '/international-relations/',
  'International Relations Department - Northbridge Institute',
  ['International Relations Department'],
  [
    'The International Relations Department advises incoming exchange students on enrolment.',
    'Language courses for exchange students are taught by the Language Centre.',
  ],
);

/** Case 9. An explicit, properly supported negative capability statement. */
const ARRIVALS_DESK = northbridge(
  4,
  '/arrivals-desk/',
  'Arrivals Desk - Northbridge Institute',
  ['Arrivals Desk'],
  [
    'The Arrivals Desk supports international students during their first weeks on campus.',
    'The Arrivals Desk does not handle outgoing exchange; it only supports arriving students.',
  ],
);

const NORTHBRIDGE_DOCS = [INTL_OFFICE, HUB, WELCOME_DESK, RELATIONS_DEPT, ARRIVALS_DESK] as const;
const NORTHBRIDGE = batchOf(
  'northbridge.example',
  'Northbridge Institute (synthetic)',
  NORTHBRIDGE_DOCS,
);

const NORTHBRIDGE_INTENDED = [
  unitPage(
    0,
    'International Office',
    ['YES', 'YES', 'UNKNOWN'],
    [
      { source: 'TITLE', quote: 'International Office - Northbridge Institute' },
      {
        source: 'EXCERPT',
        quote: 'The office advises incoming exchange students on enrolment and housing.',
      },
      {
        source: 'EXCERPT',
        quote: 'The office selects and prepares outgoing students for their semester abroad.',
      },
    ],
  ),
  notAUnit(1, 'NAVIGATION_OR_LANDING_PAGE', [
    { source: 'TITLE', quote: 'International - Northbridge Institute' },
    { source: 'EXCERPT', quote: 'Read more' },
  ]),
  unitPage(
    2,
    'Welcome Desk',
    ['YES', 'UNKNOWN', 'UNKNOWN'],
    [
      { source: 'TITLE', quote: 'Welcome Desk - Northbridge Institute' },
      {
        source: 'EXCERPT',
        quote:
          'The Welcome Desk helps every international student settle in during the first weeks.',
      },
    ],
  ),
  unitPage(
    3,
    'International Relations Department',
    ['YES', 'UNKNOWN', 'UNKNOWN'],
    [
      { source: 'TITLE', quote: 'International Relations Department - Northbridge Institute' },
      {
        source: 'EXCERPT',
        quote:
          'The International Relations Department advises incoming exchange students on enrolment.',
      },
    ],
  ),
  unitPage(
    4,
    'Arrivals Desk',
    ['YES', 'NO', 'UNKNOWN'],
    [
      {
        source: 'EXCERPT',
        quote:
          'The Arrivals Desk supports international students during their first weeks on campus.',
      },
      {
        source: 'EXCERPT',
        quote:
          'The Arrivals Desk does not handle outgoing exchange; it only supports arriving students.',
      },
    ],
  ),
] as const;

const prompt = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;

describe('V7.2 fixtures: every intended label is expressible under the unchanged output contract', () => {
  it('runs against output schema v2, unchanged, whose page_kind enum includes OTHER_NON_UNIT', () => {
    expect(ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION).toBe('orgunit-classifier-output-schema-v2');
    expect(PAGE_KINDS).toEqual([
      'DEGREE_PROGRAMME_PAGE',
      'NEWS_OR_EVENT_PAGE',
      'RESEARCH_PAGE',
      'NAVIGATION_OR_LANDING_PAGE',
      'SERVICE_TOOL_PAGE',
      'GENERIC_INSTITUTIONAL_PAGE',
      'OTHER_NON_UNIT',
    ]);
  });

  for (const [name, batch, intended] of [
    ['small adult-education centre', LAKESIDE, LAKESIDE_INTENDED],
    ['small language school', BRIGHTWATER, BRIGHTWATER_INTENDED],
    ['larger institution', NORTHBRIDGE, NORTHBRIDGE_INTENDED],
  ] as const) {
    it(`${name}: every intended result validates, with verbatim single-line spans`, () => {
      const outcome = validateClassifierResponse({ results: intended }, batch);
      expect(outcome.kind).toBe('VALIDATED');
      if (outcome.kind !== 'VALIDATED') return;
      expect(outcome.rejected).toEqual([]);
      expect(outcome.accepted).toHaveLength(intended.length);
      for (const result of intended) {
        for (const span of result.evidence_spans) {
          expect(span.quote).not.toContain('\n');
          expect([...span.quote].length).toBeLessThanOrEqual(200);
        }
      }
    });
  }

  it('the intended labels never answer NO without an explicit statement of this unit not providing it', () => {
    const all = [...LAKESIDE_INTENDED, ...BRIGHTWATER_INTENDED, ...NORTHBRIDGE_INTENDED];
    const noAnswers = all.flatMap((r) =>
      r.verdict === 'UNIT_PAGE'
        ? [
            r.serves_incoming_international_students,
            r.serves_outgoing_mobility_students,
            r.provides_language_learning_or_support,
          ]
            .filter((v) => v === 'NO')
            .map(() => r.doc_index)
        : [],
    );
    // Only the Arrivals Desk, whose own page states the exclusion.
    expect(noAnswers).toEqual([4]);
    expect(ARRIVALS_DESK.excerpt).toContain('does not handle outgoing exchange');
  });

  it('both small-organisation "About us" pages carry the same title shape, yet their intended verdicts differ: the title decides neither way', () => {
    expect(SMALL_ABOUT_US_GENERAL.title?.startsWith('About us - ')).toBe(true);
    expect(SMALL_ABOUT_US_SERVICE.title?.startsWith('About us - ')).toBe(true);
    expect(LAKESIDE_INTENDED[0].verdict).toBe('NOT_A_UNIT');
    expect(BRIGHTWATER_INTENDED[0].verdict).toBe('UNIT_PAGE');
  });
});

describe('V7.2: the deterministic validator is semantics-blind by design (unchanged), so page-level judgement lives in the prompt', () => {
  it('the V7-C1 error shape (a general "About us" overview as UNIT_PAGE with language YES from a list item) still VALIDATES', () => {
    const overviewAsUnit = unitPage(
      0,
      'Lakeside Training Centre',
      ['UNKNOWN', 'UNKNOWN', 'YES'],
      [
        { source: 'HEADING', quote: 'About us' },
        {
          source: 'EXCERPT',
          quote: 'We offer language, computer, painting and bookkeeping courses.',
        },
      ],
      'OTHER_UNIT',
    );
    const outcome = validateClassifierResponse(
      { results: [overviewAsUnit, ...LAKESIDE_INTENDED.slice(1)] },
      LAKESIDE,
    );
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });

  it('an exact quote that does not support its axis (an incoming-guidance line cited for outgoing YES) still VALIDATES', () => {
    const unsupportedOutgoing = unitPage(
      0,
      'International Office',
      ['YES', 'YES', 'UNKNOWN'],
      [
        { source: 'TITLE', quote: 'International Office - Northbridge Institute' },
        {
          source: 'EXCERPT',
          quote: 'The office advises incoming exchange students on enrolment and housing.',
        },
      ],
    );
    const outcome = validateClassifierResponse(
      { results: [unsupportedOutgoing, ...NORTHBRIDGE_INTENDED.slice(1)] },
      NORTHBRIDGE,
    );
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });

  it('an institution-level course credited to the desk, citing the exact institution sentence, still VALIDATES', () => {
    const overAttributed = unitPage(
      2,
      'Welcome Desk',
      ['YES', 'UNKNOWN', 'YES'],
      [
        {
          source: 'EXCERPT',
          quote: 'Northbridge Institute offers language courses to all of its students.',
        },
      ],
    );
    const outcome = validateClassifierResponse(
      {
        results: [
          NORTHBRIDGE_INTENDED[0],
          NORTHBRIDGE_INTENDED[1],
          overAttributed,
          ...NORTHBRIDGE_INTENDED.slice(3),
        ],
      },
      NORTHBRIDGE,
    );
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });

  it('a NO drawn from another unit providing the capability still VALIDATES (the prompt, not the validator, forbids it)', () => {
    const wrongNo = unitPage(
      3,
      'International Relations Department',
      ['YES', 'UNKNOWN', 'NO'],
      [
        {
          source: 'EXCERPT',
          quote: 'Language courses for exchange students are taught by the Language Centre.',
        },
      ],
    );
    const outcome = validateClassifierResponse(
      { results: [...NORTHBRIDGE_INTENDED.slice(0, 3), wrongNo, NORTHBRIDGE_INTENDED[4]] },
      NORTHBRIDGE,
    );
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });

  it('a paraphrased quote is still REJECTED: string matching checks presence, never meaning', () => {
    const paraphrased = unitPage(
      0,
      'Lakeside Training Centre',
      ['UNKNOWN', 'UNKNOWN', 'YES'],
      [{ source: 'EXCERPT', quote: 'We offer language courses.' }],
      'OTHER_UNIT',
    );
    const outcome = validateClassifierResponse(
      { results: [paraphrased, ...LAKESIDE_INTENDED.slice(1)] },
      LAKESIDE,
    );
    if (outcome.kind !== 'VALIDATED') throw new Error('expected VALIDATED');
    expect(outcome.rejected.map((r) => r.docIndex)).toEqual([0]);
  });
});

describe('V7.2: the prompt carries the rule clause each fixture depends on', () => {
  const clauses: readonly (readonly [string, string])[] = [
    [
      'case 1: allowance eligibility is not page classification',
      'it never makes a page a UNIT_PAGE merely because the page is about that organisation',
    ],
    [
      'case 1: a general overview is GENERIC_INSTITUTIONAL_PAGE',
      'A general introduction to the organisation, such as its history, mission, values, accreditation, levels and range of programmes, locations, leadership or a list of everything it offers, is NOT_A_UNIT with the page_kind GENERIC_INSTITUTIONAL_PAGE',
    ],
    [
      'case 1: a capability in a list is a mention',
      "a capability named once inside such an overview or list is a mention, not the page's subject",
    ],
    [
      'case 2: an "About us" page that substantively describes the operation still qualifies',
      'whose content is principally a substantive description of such an operation',
    ],
    [
      'cases 2 and 4: the substantive-operation test',
      "make the organisation's operation of a specific function or service",
    ],
    ['case 4: the allowance itself is kept', 'A named office is not required for this.'],
    [
      'case 5: homepages stay NOT_A_UNIT',
      'a homepage, marketing or navigation page, degree or course page, and news or event page remain NOT_A_UNIT',
    ],
    [
      'case 6: a hub of teasers is NAVIGATION_OR_LANDING_PAGE',
      'even when one summary names a unit and states its role',
    ],
    [
      'testimonials keep their own page_kind',
      'Promotional summaries, testimonials, news and navigation pages',
    ],
    [
      'case 7: institution-level capability is not the unit',
      'the institution offering language courses does not mean this unit provides language support',
    ],
    [
      'case 8: another unit providing it is UNKNOWN, never NO',
      'That another unit, the institution or a partner provides the capability does not establish NO for this unit',
    ],
    [
      'case 9: NO needs this unit not providing it',
      'Answer NO only when the document affirmatively establishes that this unit does not provide the capability',
    ],
    [
      'case 10: an exact quote must also support its claim',
      'A quote that appears in the document is still not evidence for a claim it does not support.',
    ],
    [
      'dedicated services without a formal title stay eligible',
      'A formal department title is not required',
    ],
  ];
  for (const [fixture, clause] of clauses) {
    it(`${fixture}`, () => {
      expect(prompt).toContain(clause);
    });
  }
});
