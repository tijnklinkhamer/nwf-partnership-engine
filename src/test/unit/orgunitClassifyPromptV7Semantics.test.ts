/**
 * OPERATIONAL PILOT P3 — PROMPT V7 SEMANTIC FIXTURES (DETERMINISTIC ONLY).
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. Every fixture below is SYNTHETIC
 * text about a fictional institution ("Northbridge Institute"). None is
 * copied from a real page, and none comes from DEV_CONFIRM, FINAL_HOLDOUT,
 * PARIS520 or any other protected evaluation document or label. The shapes
 * are modelled on the operational pilot P2-X2 review (a landing hub
 * promoted to UNIT_PAGE; a genuine department page; a dedicated welcome-desk
 * page; an institution-level language course credited to a unit). Those
 * examples guided development, so they are not an independent acceptance
 * set.
 *
 * The tests prove three things only:
 *   (a) the label v7 intends for each fixture is EXPRESSIBLE under the
 *       unchanged output schema v2 and passes the unchanged deterministic
 *       validator (verbatim, single-line, <= 200 code points);
 *   (b) the deterministic validator is semantics-blind by design: a
 *       verbatim but irrelevant quote, and the exact P2-X2 error shapes,
 *       still validate, so semantic support lives in the prompt only;
 *   (c) the v7 prompt carries the rule clause each fixture depends on.
 *
 * PASSING MOCKED TESTS DO NOT PROVE BETTER REAL-MODEL CLASSIFICATION. No
 * model is called here; whether the model follows v7 is unproven until an
 * OWNER-approved live comparison.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { describe, expect, it } from 'vitest';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import { validateClassifierResponse } from '../../orgunits/classify/validate.js';
import type {
  ClassifierBatch,
  ClassifierDocument,
  Heading,
} from '../../orgunits/classify/types.js';

const ROOT = {
  rootKey: 'claim:synthetic-northbridge',
  authorityKind: 'claim' as const,
  url: 'https://northbridge.example/',
};

function doc(
  docIndex: number,
  path: string,
  title: string,
  headings: readonly string[],
  excerptLines: readonly string[],
): ClassifierDocument {
  return {
    docIndex,
    url: `https://northbridge.example${path}`,
    title,
    declaredLang: 'en',
    headings: headings.map((text, i): Heading => ({ level: i === 0 ? 1 : 2, text })),
    excerpt: excerptLines.join('\n'),
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v2',
    discoveryMethod: 'LINK',
    roots: [ROOT],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
  };
}

type Tri = 'YES' | 'NO' | 'UNKNOWN';
type Span = {
  readonly source: 'TITLE' | 'HEADING' | 'EXCERPT' | 'URL_PATH';
  readonly quote: string;
};

function unitPage(
  docIndex: number,
  unitName: string,
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
    rationale: 'Synthetic fixture: the intended v7 label.',
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
    rationale: 'Synthetic fixture: the intended v7 label.',
    evidence_spans: spans,
  };
}

// --- Fixtures --------------------------------------------------------------

/** Modelled on P2-X2 doc 9: a section hub of teasers, one of which names a unit and its role. */
const LANDING_HUB = doc(
  0,
  '/international/',
  'International - Northbridge Institute',
  ['International', 'Incoming and outgoing mobility', 'Exchange students', 'Welcome Desk'],
  [
    'Northbridge Institute wants every student to gain a global outlook.',
    'The International Office has built a network of partner universities worldwide. The development of [...]',
    'Read more →',
    'Exchange students can follow courses taught in English for one or two semesters. [...]',
    'Read more →',
    'The Welcome Desk helps you settle in when you arrive. [...]',
    'Read more →',
  ],
);

/** Modelled on P2-X2 doc 10: the department's own page, with an institution-level language-course sentence. */
const DEPARTMENT = doc(
  1,
  '/international/mobility/',
  'Incoming and outgoing mobility - Northbridge Institute',
  ['Incoming and outgoing mobility', 'International contacts'],
  [
    'The International Office has built a network of partner universities worldwide.',
    'The International Office provides incoming international students with academic and administrative assistance.',
    'The office also prepares outgoing students for their semester abroad.',
    'The Institute offers French language and culture courses to all international students.',
  ],
);

/** Modelled on P2-X2 doc 11: a dedicated service page without a formal department title. */
const WELCOME_DESK = doc(
  2,
  '/international/welcome-desk/',
  'Welcome Desk - Northbridge Institute',
  ['Welcome Desk', 'International contacts'],
  [
    'The Welcome Desk helps every exchange and full-time international student settle in.',
    'We assist you from admission until the end of your studies.',
    'Finding accommodation',
    'Visa renewal',
    'Opening a bank account',
    'Contact the desk at [EMAIL].',
  ],
);

/** Mention-only news page. */
const NEWS = doc(
  3,
  '/news/erasmus-days/',
  'Erasmus Days at Northbridge - Northbridge Institute',
  ['Erasmus Days at Northbridge'],
  [
    'On Tuesday students met partner universities at the Erasmus Days fair.',
    'The International Office welcomed visitors at its stand.',
  ],
);

/** Mention-only programme page. */
const PROGRAMME = doc(
  4,
  '/programmes/msc-global-business/',
  'MSc Global Business - Northbridge Institute',
  ['MSc Global Business', 'Admissions'],
  [
    'The MSc Global Business is a two-year programme taught in English.',
    'Exchange semesters are arranged with the International Office.',
  ],
);

/** A NO case: the page affirmatively places outgoing mobility with another unit. */
const ARRIVALS_DESK = doc(
  5,
  '/arrivals-desk/',
  'Arrivals Desk - Northbridge Institute',
  ['Arrivals Desk'],
  [
    'The Arrivals Desk supports international students during their first weeks on campus.',
    'Outgoing exchange is handled by the Mobility Office, not by the Arrivals Desk.',
  ],
);

/** A genuine office whose own page links to its own sub-pages: must stay eligible. */
const OFFICE_WITH_SUBPAGES = doc(
  6,
  '/international-office/',
  'International Office - Northbridge Institute',
  ['International Office', 'Incoming students', 'Outgoing students', 'Opening hours'],
  [
    'The International Office coordinates incoming and outgoing student exchanges for the whole Institute.',
    'Incoming students: arrival guide and course catalogue.',
    'Read more →',
    'Outgoing students: how to apply for a semester abroad.',
    'Read more →',
    'Opening hours: Monday to Friday, 9:00 to 16:00.',
  ],
);

/** A language service, to keep the language axis reachable as YES when the unit itself provides it. */
const LANGUAGE_CENTRE = doc(
  7,
  '/language-centre/',
  'Language Centre - Northbridge Institute',
  ['Language Centre'],
  [
    'The Language Centre teaches English, German and French to all students of the Institute.',
    'Self-study rooms are open every weekday.',
  ],
);

const DOCUMENTS = [
  LANDING_HUB,
  DEPARTMENT,
  WELCOME_DESK,
  NEWS,
  PROGRAMME,
  ARRIVALS_DESK,
  OFFICE_WITH_SUBPAGES,
  LANGUAGE_CENTRE,
] as const;

const BATCH: ClassifierBatch = {
  context: {
    organisationName: 'Northbridge Institute (synthetic)',
    echeRowKey: 'synthetic-row',
    countryCode: 'XX',
    runId: '00000000-0000-4000-8000-000000000000',
    ruleVersion: 'synthetic',
    fetchPolicyVersion: 'synthetic',
    assemblyVersion: 'orgunit-classifier-assembly-v2',
    rootKey: null,
    roots: [ROOT],
  },
  documents: DOCUMENTS,
};

/** The intended v7 label for every fixture, with spans that SUPPORT the claim they back. */
const INTENDED = [
  notAUnit(0, 'NAVIGATION_OR_LANDING_PAGE', [
    { source: 'TITLE', quote: 'International - Northbridge Institute' },
    { source: 'EXCERPT', quote: 'Read more →' },
  ]),
  unitPage(
    1,
    'International Office',
    ['YES', 'YES', 'UNKNOWN'],
    [
      {
        source: 'EXCERPT',
        quote:
          'The International Office provides incoming international students with academic and administrative assistance.',
      },
      {
        source: 'EXCERPT',
        quote: 'The office also prepares outgoing students for their semester abroad.',
      },
    ],
  ),
  unitPage(
    2,
    'Welcome Desk',
    ['YES', 'UNKNOWN', 'UNKNOWN'],
    [
      { source: 'TITLE', quote: 'Welcome Desk - Northbridge Institute' },
      {
        source: 'EXCERPT',
        quote:
          'The Welcome Desk helps every exchange and full-time international student settle in.',
      },
    ],
  ),
  notAUnit(3, 'NEWS_OR_EVENT_PAGE', [
    { source: 'TITLE', quote: 'Erasmus Days at Northbridge - Northbridge Institute' },
  ]),
  notAUnit(4, 'DEGREE_PROGRAMME_PAGE', [
    { source: 'TITLE', quote: 'MSc Global Business - Northbridge Institute' },
  ]),
  unitPage(
    5,
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
        quote: 'Outgoing exchange is handled by the Mobility Office, not by the Arrivals Desk.',
      },
    ],
  ),
  unitPage(
    6,
    'International Office',
    ['YES', 'YES', 'UNKNOWN'],
    [
      { source: 'TITLE', quote: 'International Office - Northbridge Institute' },
      {
        source: 'EXCERPT',
        quote:
          'The International Office coordinates incoming and outgoing student exchanges for the whole Institute.',
      },
    ],
  ),
  unitPage(
    7,
    'Language Centre',
    ['UNKNOWN', 'UNKNOWN', 'YES'],
    [
      {
        source: 'EXCERPT',
        quote:
          'The Language Centre teaches English, German and French to all students of the Institute.',
      },
    ],
    'LANGUAGE_CENTRE',
  ),
] as const;

const validate = (results: readonly unknown[]) => validateClassifierResponse({ results }, BATCH);

const prompt = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT;

describe('P3 v7 fixtures: every intended label is expressible under the unchanged output contract', () => {
  it('runs against output schema v2, unchanged', () => {
    expect(ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION).toBe('orgunit-classifier-output-schema-v2');
  });

  it('all eight intended results validate: no rejection, every span verbatim and single-line', () => {
    const outcome = validate(INTENDED);
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind !== 'VALIDATED') return;
    expect(outcome.rejected).toEqual([]);
    expect(outcome.accepted.map((a) => a.result.doc_index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const result of INTENDED) {
      expect(result.evidence_spans.length).toBeGreaterThanOrEqual(1);
      expect(result.evidence_spans.length).toBeLessThanOrEqual(4);
      for (const span of result.evidence_spans) {
        expect(span.quote).not.toContain('\n');
        expect([...span.quote].length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('two genuine pages about the same unit may both be UNIT_PAGE: no cross-document deduplication in the page classifier', () => {
    const outcome = validate(INTENDED);
    if (outcome.kind !== 'VALIDATED') throw new Error('expected VALIDATED');
    const sameUnit = outcome.accepted.filter((a) => a.result.unit_name === 'International Office');
    expect(sameUnit.map((a) => a.result.doc_index)).toEqual([1, 6]);
    expect(sameUnit.every((a) => a.result.verdict === 'UNIT_PAGE')).toBe(true);
  });

  it('a UNIT_PAGE with one supporting span per YES axis plus identity fits within the four-span limit', () => {
    const fullService = doc(
      8,
      '/global-office/',
      'Global Office - Northbridge Institute',
      ['Global Office'],
      [
        'The Global Office welcomes incoming exchange students and arranges their housing.',
        'The Global Office prepares outgoing students for their semester abroad.',
        'The Global Office runs free French conversation classes for its exchange students.',
      ],
    );
    const allYes = unitPage(
      8,
      'Global Office',
      ['YES', 'YES', 'YES'],
      [
        { source: 'TITLE', quote: 'Global Office - Northbridge Institute' },
        {
          source: 'EXCERPT',
          quote:
            'The Global Office welcomes incoming exchange students and arranges their housing.',
        },
        {
          source: 'EXCERPT',
          quote: 'The Global Office prepares outgoing students for their semester abroad.',
        },
        {
          source: 'EXCERPT',
          quote:
            'The Global Office runs free French conversation classes for its exchange students.',
        },
      ],
    );
    const outcome = validateClassifierResponse(
      { results: [allYes] },
      { ...BATCH, documents: [fullService] },
    );
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });
});

describe('P3 v7: the deterministic validator is semantics-blind by design (unchanged), so semantic support lives in the prompt', () => {
  it('the P2-X2 doc-9 error shape (landing hub as UNIT_PAGE citing a teaser) still VALIDATES', () => {
    const hubAsUnit = unitPage(
      0,
      'International Office',
      ['YES', 'YES', 'UNKNOWN'],
      [
        {
          source: 'EXCERPT',
          quote: 'The International Office has built a network of partner universities worldwide.',
        },
        { source: 'HEADING', quote: 'Incoming and outgoing mobility' },
      ],
    );
    const outcome = validate([hubAsUnit, ...INTENDED.slice(1)]);
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });

  it('the P2-X2 doc-10 error shape (institution-level language course credited to the unit) still VALIDATES', () => {
    const overAttributed = unitPage(
      1,
      'International Office',
      ['YES', 'YES', 'YES'],
      [
        {
          source: 'EXCERPT',
          quote:
            'The International Office provides incoming international students with academic and administrative assistance.',
        },
        {
          source: 'EXCERPT',
          quote:
            'The Institute offers French language and culture courses to all international students.',
        },
      ],
    );
    const outcome = validate([INTENDED[0], overAttributed, ...INTENDED.slice(2)]);
    expect(outcome.kind).toBe('VALIDATED');
    if (outcome.kind === 'VALIDATED') expect(outcome.rejected).toEqual([]);
  });

  it('a quote that runs across a line break is still REJECTED per document (the existing DB-boundary rule)', () => {
    const multiLine = unitPage(
      2,
      'Welcome Desk',
      ['YES', 'UNKNOWN', 'UNKNOWN'],
      [{ source: 'EXCERPT', quote: 'Finding accommodation\nVisa renewal' }],
    );
    const outcome = validate([INTENDED[0], INTENDED[1], multiLine, ...INTENDED.slice(3)]);
    if (outcome.kind !== 'VALIDATED') throw new Error('expected VALIDATED');
    expect(outcome.rejected.map((r) => r.docIndex)).toEqual([2]);
    expect(outcome.accepted).toHaveLength(7);
  });

  it('a joined or abridged quote is still REJECTED: never concatenated, never shortened', () => {
    const joined = unitPage(
      1,
      'International Office',
      ['YES', 'YES', 'UNKNOWN'],
      [
        {
          source: 'EXCERPT',
          quote:
            'The International Office provides incoming international students with French language courses.',
        },
      ],
    );
    const outcome = validate([INTENDED[0], joined, ...INTENDED.slice(2)]);
    if (outcome.kind !== 'VALIDATED') throw new Error('expected VALIDATED');
    expect(outcome.rejected.map((r) => r.docIndex)).toEqual([1]);
  });
});

describe('P3 v7: the prompt carries the rule clause each fixture depends on', () => {
  const clauses: readonly (readonly [string, string])[] = [
    [
      'landing hub (doc-9 shape)',
      'A landing, hub or section page whose body introduces several services, programmes or pages in turn',
    ],
    [
      'landing hub even when one teaser names a unit',
      'even when one summary names a unit and states its role',
    ],
    [
      'genuine office with its own sub-pages',
      "it is that unit's page only when its title or leading heading is the unit's own name",
    ],
    [
      'dedicated service without formal title (doc-11 shape)',
      'A formal department title is not required',
    ],
    [
      'mention-only news and programme pages',
      'that names an office, even with a sentence on what that office does, takes the page_kind of its own subject',
    ],
    [
      'duplicates: both genuine pages may be UNIT_PAGE',
      'two pages that are each about the same unit may both be UNIT_PAGE',
    ],
    [
      'capability attributed to the unit only (doc-10 shape)',
      'Each axis describes only the unit this page is about',
    ],
    [
      'institution-level language courses',
      'the institution offering language courses does not mean this unit provides language support',
    ],
    [
      'incoming is not outgoing',
      'help for arriving students is not by itself support for outgoing mobility',
    ],
    [
      'NO needs affirmative exclusion or another unit',
      'or that another unit is responsible for it instead',
    ],
    ['missing evidence never becomes NO', 'missing or misattributed evidence is UNKNOWN, never NO'],
    [
      'small-organisation allowance keeps organisation-level capabilities',
      'Under the small or non-university allowance the unit is the organisation itself',
    ],
    [
      'verbatim is not enough',
      'A quote that appears in the document is still not evidence for a claim it does not support',
    ],
    [
      'one supporting span per YES axis',
      'for each axis answered YES, a span in which this unit is stated to provide that capability',
    ],
    [
      'single-line, never rewritten',
      'never let a quote run across a line break, and never join, shorten, normalise or reword text',
    ],
  ];
  for (const [fixture, clause] of clauses) {
    it(`${fixture}`, () => {
      expect(prompt.split(clause)).toHaveLength(2);
    });
  }
});
