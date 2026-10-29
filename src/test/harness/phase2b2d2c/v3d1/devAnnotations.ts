/**
 * PHASE 2B-2D2C-V3D1 — ANALYST ANNOTATIONS OF THE 49 FROZEN DEVELOPMENT
 * DOCUMENTS, IN THE CONTRACT'S EVIDENCE VOCABULARY.
 *
 * Each entry records what an analyst read off the frozen canonical
 * DEVELOPMENT document (title, headings, excerpt, URL) and the batch
 * context's organisation class — nothing from any model output, and
 * nothing from HOLDOUT. The gold verdict is carried beside each entry ONLY
 * so the contract test can compare; it is copied from the committed
 * DEVELOPMENT label fixture and changes no label.
 *
 * These are fixture data for the specification tests in
 * `orgunitClassify2D2CV3D1Contract.test.ts`. They are not a classifier's
 * outputs and are never read by production code. Test fixtures may name
 * frozen DEVELOPMENT ids; the prompt text never does.
 */
import type { ContractVerdict, PageEvidenceFeatures } from './contract.js';

export interface AnnotatedDevItem extends PageEvidenceFeatures {
  readonly goldId: string;
  readonly goldVerdict: ContractVerdict;
  /** A one-line, organisation-agnostic description of the evidence that fixed the annotation. */
  readonly basis: string;
}

const U: PageEvidenceFeatures['organisationClass'] = 'UNIVERSITY';
const S: PageEvidenceFeatures['organisationClass'] = 'SMALL_OR_NON_UNIVERSITY';

export const DEV_ANNOTATIONS: readonly AnnotatedDevItem[] = Object.freeze([
  // --- batch 1: a small regional social-work training institute (SMALL_OR_NON_UNIVERSITY)
  {
    goldId: 'g7e9744e811f58e20',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'H1 names a documentation centre; the remaining headings are its e-mail, phone and opening-hours fields.',
  },
  {
    goldId: 'g057656b07c6aa620',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'TOOL_OR_FORM_OR_VIEWER',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'An institution-level "contact us" page: address, e-mail, phone, hours; no unit as subject.',
  },
  {
    goldId: 'g66010a25ac194274',
    goldVerdict: 'NEEDS_REVIEW',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'TOO_SPARSE_WITH_UNIT_SHAPED_SIGNALS',
    basis:
      'Title and H1 name the programme under a partners path; the only body text repeats the H1 and the other headings are post navigation.',
  },
  // --- batch 2: a public university (UNIVERSITY)
  {
    goldId: 'g735298870fe173b8',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'An incoming exchange-student page whose second heading names a mobility office and whose body gives that office phone, e-mail and room.',
  },
  {
    goldId: 'g6458a352bc79ca01',
    goldVerdict: 'NEEDS_REVIEW',
    structuralSubject: 'LISTING_OR_INDEX',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'TOO_SPARSE_WITH_UNIT_SHAPED_SIGNALS',
    basis:
      'A "Contacts" index whose headings name a directorate and its correspondents, with an empty excerpt: unit-shaped signals, nothing to tell a unit contact page from a navigation index.',
  },
  {
    goldId: 'g52788fd323659c9c',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'LISTING_OR_INDEX',
    namedUnit: 'DIRECTORY_OF_MANY',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A directory of per-faculty correspondents with names and phones across every faculty; no single unit is the subject.',
  },
  {
    goldId: 'g57607d4278d6dc23',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'An outgoing-mobility function page carrying a heading that names a directorate and a block stating its director, mission, address, phone and mail.',
  },
  {
    goldId: 'g3130d41296ab8739',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'INLINE_MENTION_ONLY',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A how-to for a staff training-mobility scheme (definition, benefits, eligibility, duration, steps, grant); the directorate appears only as the step to inform and the mailbox to send a kit to.',
  },
  // --- batch 3: a large private business school (SMALL_OR_NON_UNIVERSITY by class, not by size)
  {
    goldId: 'g1f85c7bcf67d324e',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'TOOL_OR_FORM_OR_VIEWER',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'An alumni directory search with sign-in options; a tool page.',
  },
  {
    goldId: 'g3ef86bc145abfab0',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DEGREE_PROGRAMME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'Admissions competition page for a named bachelor programme: entry routes, calendar, places.',
  },
  {
    goldId: 'ge419f0b9902faee0',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'An international-students page whose body names an integration team, states its goal and what it provides, and carries a contact-details heading.',
  },
  {
    goldId: 'g7c122ea506478abd',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DEGREE_PROGRAMME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A bachelor programme page: format, duration, campuses, tuition, admission level.',
  },
  // --- batch 4: a small university centre (SMALL_OR_NON_UNIVERSITY)
  {
    goldId: 'g05d5854d451532bb',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'TOOL_OR_FORM_OR_VIEWER',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A flipbook viewer wrapping a charter PDF; no headings, a three-character excerpt.',
  },
  {
    goldId: 'ga435ea22d4b11cf4',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'TOOL_OR_FORM_OR_VIEWER',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'A contact-form template (name, e-mail, message, captcha) addressed to a documentation centre; nothing about the unit beyond its name.',
  },
  {
    goldId: 'g4454e841c09dd8d0',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'TOOL_OR_FORM_OR_VIEWER',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'The same contact-form template addressed to an IT resources centre.',
  },
  {
    goldId: 'g5f96e37ff602795a',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A dated information-week event announcement embedded in an events listing.',
  },
  {
    goldId: 'gdb5b7246327094ef',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: true,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      "A regional-cooperation and international-relations page stating the centre's own cooperation policy, its priority actions and its membership taken to welcome international students; no unit named.",
  },
  // --- batch 5: a lapsed apprenticeship-centre domain now serving unrelated content
  {
    goldId: 'g581e2c0586577331',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'UNRELATED_CONTENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A home-improvement article farm on a lapsed domain.',
  },
  {
    goldId: 'g4aa8728f64f4525d',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'UNRELATED_CONTENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'An archive listing of unrelated articles on the same lapsed domain.',
  },
  {
    goldId: 'g04c5e4d705a2e184',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'UNRELATED_CONTENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A category archive of unrelated articles on the same lapsed domain.',
  },
  // --- batch 6: a small two-year vocational school (SMALL_OR_NON_UNIVERSITY)
  {
    goldId: 'g04b64db14c03ce3a',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'WHOLE_INSTITUTION_OVERVIEW',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'The school homepage: welcome banner, news teasers, programme links, empty excerpt.',
  },
  {
    goldId: 'g2dba4106c328f4b8',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'TOOL_OR_FORM_OR_VIEWER',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A global template fragment (a logo carousel) exposing one boilerplate line.',
  },
  {
    goldId: 'g12732ff0388c49e8',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A dated news post with comment navigation.',
  },
  {
    goldId: 'g7d88b2fecb73fdb4',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A dated event-recap news post with comment navigation.',
  },
  {
    goldId: 'ge789b0f0aedc398c',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: true,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      "A programme-titled page whose own headings are the school's charter, the school's strategy for international mobility, the benefits and who is eligible: the organisation's own standing commitment is the structural subject, at heading level, with no named office. Owner-confirmed reading.",
  },
  // --- batch 7: a public university (UNIVERSITY)
  {
    goldId: 'g0ec0d43dad311a77',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A supplementary-grant page under the outgoing-mobility section whose headings include "contact the directorate" and "address and hours of the directorate": the named unit is presented as the operator, at heading level.',
  },
  {
    goldId: 'g877a05e6f5bba835',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      "The directorate's own welcome page: the excerpt opens with the directorate's name, the body states what it manages and the desk it set up, and a heading invites following the directorate on social networks.",
  },
  {
    goldId: 'gcce4e2a5f608de5d',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'A directory-style department page: heads, address, parent faculty, degree offerings.',
  },
  {
    goldId: 'gf65026e32d9da8db',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A mobility-aid page whose body names the directorate as the body that may fund and receives the application, with a heading-level contact section for that directorate.',
  },
  {
    goldId: 'g2e0dc1ff57327033',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'LISTING_OR_INDEX',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'A partner-destinations listing whose only visible content is a zone-closure note.',
  },
  // --- batch 8: a private business school (SMALL_OR_NON_UNIVERSITY by class)
  {
    goldId: 'g5e9c0d460fee879b',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'RESEARCH_OR_ACADEMIC_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'An academic finance conference page: organisers, programme chairs, committee.',
  },
  {
    goldId: 'g543b604f0f0f8380',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'RESEARCH_OR_ACADEMIC_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'The next edition of the same academic conference.',
  },
  {
    goldId: 'g32779df2d7b56a34',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'Headings are the external programme "at a glance", grant amounts by country group, staff mobility and an FAQ; the body describes the funder\'s programme and grant tables; the organisation appears in one sentence as a participant. No own strategy, charter or responsibility is the structural subject.',
  },
  {
    goldId: 'g956f99fae4ad4764',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'The French twin of the preceding page: same structure, same single participation sentence.',
  },
  // --- batch 9: a large public university (UNIVERSITY)
  {
    goldId: 'g1a0315d94121cfcf',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'An event page with calendar metadata (date, hours, campus) for a welcome day.',
  },
  {
    goldId: 'g27504b2635a39531',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'LISTING_OR_INDEX',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'A news-category archive of dated mobility headlines.',
  },
  {
    goldId: 'g04d170f4d3fda759',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: true,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A mobility-aid overview whose heading says the aids are managed by the university itself (eligibility, payment, how to apply, whom to contact); no unit named. The institution as a whole is the only operator evidenced, and it is a university.',
  },
  {
    goldId: 'g82fe2243c52f4d73',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'The English mirror of the welcome-day event page, with the same calendar metadata.',
  },
  // --- batch 10: a private business school (SMALL_OR_NON_UNIVERSITY)
  {
    goldId: 'g0b760d6f3dfafad5',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A dated corporate-acquisition news item.',
  },
  {
    goldId: 'g34bbf7536e99b410',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: true,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      "An international-students page: the school's own welcome process, personalised follow-up and a heading-level visa-assistance service; no unit named.",
  },
  {
    goldId: 'ga971a6fc52af6b5f',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: true,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'The French twin of the preceding page.',
  },
  // --- batch 11: a small paramedical training institute (SMALL_OR_NON_UNIVERSITY)
  {
    goldId: 'g7a394e6b1670f7ab',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A dated news item about a pedagogy day.',
  },
  {
    goldId: 'g0615c0e6bcd45942',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DATED_NEWS_OR_EVENT',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis: 'A dated news item about a general assembly.',
  },
  {
    goldId: 'g9c1b65eda41afda2',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: true,
    organisationClass: S,
    evidence: 'SUFFICIENT',
    basis:
      'An international-relations page (H1) describing outgoing and incoming mobilities and ending with a contact block for the named international-relations service.',
  },
  // --- batch 12: a public engineering school with university status (UNIVERSITY)
  {
    goldId: 'g1b50947deb11a6d5',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'WHOLE_INSTITUTION_OVERVIEW',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'The institution homepage: programme menus, news, key figures, brochures.',
  },
  {
    goldId: 'g536c8b148048fcbc',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'PROGRAMME_OR_SCHEME',
    namedUnit: 'INLINE_MENTION_ONLY',
    organisationOwnStandingCommitment: true,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A scholarships page (two external programmes and one own prize); the international directorate appears only as the mailbox to contact and the deadline recipient.',
  },
  {
    goldId: 'g99a9fe00e4856de2',
    goldVerdict: 'UNIT_PAGE',
    structuralSubject: 'UNIT_OR_STANDING_FUNCTION',
    namedUnit: 'OPERATOR_SECTION',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis:
      'A language-provision page (H1 names the provision) with levels, weekly hours, a dedicated library and a named responsible teacher to contact: the provision is presented as an operating service.',
  },
  {
    goldId: 'g39e7132da4064000',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'LISTING_OR_INDEX',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'A section landing listing cooperation projects with a short intro.',
  },
  {
    goldId: 'g9978fec48fa77fbb',
    goldVerdict: 'NOT_A_UNIT',
    structuralSubject: 'DEGREE_PROGRAMME',
    namedUnit: 'NONE',
    organisationOwnStandingCommitment: false,
    organisationClass: U,
    evidence: 'SUFFICIENT',
    basis: 'A joint master programme page: curriculum, partner institutions, project number.',
  },
]);
