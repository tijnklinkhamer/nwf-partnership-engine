/**
 * PHASE 2B-2D2C-V3D1 — THE PROPOSED PROMPT-V3 PAGE-SUBJECT CONTRACT, AS A
 * PURE SPECIFICATION RULE.
 *
 * THIS IS NOT A CLASSIFIER. It takes a small vector of evidence attributes
 * that an analyst has read off a frozen document and returns the verdict
 * the proposed Prompt V3 contract says that evidence warrants. Its purpose
 * is to make the contract's clauses executable so that:
 *
 *   - the owner-confirmed whole-organisation mobility-function reading is
 *     pinned as a rule, not a remembered exception;
 *   - every protected NOT_A_UNIT mechanism is pinned as a rule that a
 *     positive rescue cannot silently override;
 *   - the deterministic counterexample review over every DEVELOPMENT
 *     negative is a test that fails if a clause would flip one.
 *
 * The attributes are deliberately OBSERVABLE properties of the supplied
 * fields (what the title and headings are structurally about; whether a
 * named unit is presented as the operator or only mentioned inline; whether
 * the organisation attributes its own standing commitment to itself; the
 * organisation's class from the batch context; whether the evidence is too
 * sparse), never the verdict restated. The annotations for the frozen
 * DEVELOPMENT documents live in `devAnnotations.ts` and are the analyst's
 * reading of those documents; the rule below is the contract. Neither
 * touches `src/orgunits/classify/prompt.ts`, and no production module
 * imports this file.
 *
 * PURE. No filesystem, no network, no clock, no randomness.
 */

export type StructuralSubjectKind =
  /** The title/H1/majority of headings are a unit, service, provision, or a standing audience-facing function. */
  | 'UNIT_OR_STANDING_FUNCTION'
  /** The title/H1/majority of headings are a programme, grant, aid or scholarship scheme. */
  | 'PROGRAMME_OR_SCHEME'
  | 'DATED_NEWS_OR_EVENT'
  | 'LISTING_OR_INDEX'
  | 'DEGREE_PROGRAMME'
  | 'TOOL_OR_FORM_OR_VIEWER'
  | 'WHOLE_INSTITUTION_OVERVIEW'
  | 'RESEARCH_OR_ACADEMIC_EVENT'
  | 'UNRELATED_CONTENT';

export type NamedUnitPresentation =
  /** A heading, section or block names the unit and states its role, contact or address FOR THIS PAGE'S SUBJECT. */
  | 'OPERATOR_SECTION'
  /** The unit appears only as a step, mailbox or contact line inside a procedure whose subject is the scheme. */
  | 'INLINE_MENTION_ONLY'
  /** Many units or people are listed with no single one as subject. */
  | 'DIRECTORY_OF_MANY'
  | 'NONE';

export type OrganisationClass = 'UNIVERSITY' | 'SMALL_OR_NON_UNIVERSITY';

export type EvidenceSufficiency = 'SUFFICIENT' | 'TOO_SPARSE_WITH_UNIT_SHAPED_SIGNALS';

export interface PageEvidenceFeatures {
  readonly structuralSubject: StructuralSubjectKind;
  readonly namedUnit: NamedUnitPresentation;
  /**
   * True only when the document attributes, in its title or headings or as
   * the body's own grammatical subject, the organisation's OWN ongoing
   * strategy, charter, eligibility rules, responsibility or operations for
   * the function — never when the organisation merely says it takes part
   * in an external programme that the page then describes.
   */
  readonly organisationOwnStandingCommitment: boolean;
  readonly organisationClass: OrganisationClass;
  readonly evidence: EvidenceSufficiency;
}

export type ContractVerdict = 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW';

export type ContractClause =
  | 'SPARSE_UNIT_SHAPED_EVIDENCE_NEEDS_REVIEW'
  | 'DIRECTORY_OF_MANY_NOT_A_UNIT'
  | 'STRUCTURAL_NON_OPERATING_KIND_NOT_A_UNIT'
  | 'NAMED_OPERATOR_SECTION_UNIT_PAGE'
  | 'WHOLE_ORGANISATION_STANDING_FUNCTION_UNIT_PAGE'
  | 'INLINE_MENTION_IS_NOT_AN_OPERATOR_NOT_A_UNIT'
  | 'NO_OPERATOR_EVIDENCED_NOT_A_UNIT';

export interface ContractDecision {
  readonly verdict: ContractVerdict;
  readonly clause: ContractClause;
}

const NON_OPERATING_KINDS: ReadonlySet<StructuralSubjectKind> = new Set([
  'DATED_NEWS_OR_EVENT',
  'LISTING_OR_INDEX',
  'DEGREE_PROGRAMME',
  'TOOL_OR_FORM_OR_VIEWER',
  'WHOLE_INSTITUTION_OVERVIEW',
  'RESEARCH_OR_ACADEMIC_EVENT',
  'UNRELATED_CONTENT',
]);

/**
 * The proposed contract, in clause order. The ORDER is the design: the
 * protective clauses run before any positive clause, so no positive rescue
 * can reach a dated item, a listing, a degree programme, a tool, a homepage,
 * a research event, unrelated content or a directory.
 */
export function applyPromptV3Contract(features: PageEvidenceFeatures): ContractDecision {
  if (features.evidence === 'TOO_SPARSE_WITH_UNIT_SHAPED_SIGNALS') {
    return { verdict: 'NEEDS_REVIEW', clause: 'SPARSE_UNIT_SHAPED_EVIDENCE_NEEDS_REVIEW' };
  }
  if (features.namedUnit === 'DIRECTORY_OF_MANY') {
    return { verdict: 'NOT_A_UNIT', clause: 'DIRECTORY_OF_MANY_NOT_A_UNIT' };
  }
  if (NON_OPERATING_KINDS.has(features.structuralSubject)) {
    return { verdict: 'NOT_A_UNIT', clause: 'STRUCTURAL_NON_OPERATING_KIND_NOT_A_UNIT' };
  }
  // From here the structural subject is UNIT_OR_STANDING_FUNCTION or PROGRAMME_OR_SCHEME.
  if (features.namedUnit === 'OPERATOR_SECTION') {
    return { verdict: 'UNIT_PAGE', clause: 'NAMED_OPERATOR_SECTION_UNIT_PAGE' };
  }
  if (features.namedUnit === 'INLINE_MENTION_ONLY') {
    return { verdict: 'NOT_A_UNIT', clause: 'INLINE_MENTION_IS_NOT_AN_OPERATOR_NOT_A_UNIT' };
  }
  if (
    features.organisationOwnStandingCommitment &&
    features.organisationClass === 'SMALL_OR_NON_UNIVERSITY'
  ) {
    return { verdict: 'UNIT_PAGE', clause: 'WHOLE_ORGANISATION_STANDING_FUNCTION_UNIT_PAGE' };
  }
  return { verdict: 'NOT_A_UNIT', clause: 'NO_OPERATOR_EVIDENCED_NOT_A_UNIT' };
}

/**
 * The "broader reading" perturbations the counterexample review probes: each
 * one relaxes a single attribute in the direction a looser prompt reading
 * would, so the review can list exactly which negatives would flip.
 */
export type BroaderReading =
  | 'PARTICIPATION_READ_AS_OWN_COMMITMENT'
  | 'INLINE_MENTION_READ_AS_OPERATOR'
  | 'UNIVERSITY_READ_AS_SMALL_ORGANISATION'
  | 'HOMEPAGE_READ_AS_STANDING_FUNCTION';

export function applyBroaderReading(
  features: PageEvidenceFeatures,
  reading: BroaderReading,
): PageEvidenceFeatures {
  switch (reading) {
    case 'PARTICIPATION_READ_AS_OWN_COMMITMENT':
      return { ...features, organisationOwnStandingCommitment: true };
    case 'INLINE_MENTION_READ_AS_OPERATOR':
      return features.namedUnit === 'INLINE_MENTION_ONLY'
        ? { ...features, namedUnit: 'OPERATOR_SECTION' }
        : features;
    case 'UNIVERSITY_READ_AS_SMALL_ORGANISATION':
      return { ...features, organisationClass: 'SMALL_OR_NON_UNIVERSITY' };
    case 'HOMEPAGE_READ_AS_STANDING_FUNCTION':
      return features.structuralSubject === 'WHOLE_INSTITUTION_OVERVIEW'
        ? { ...features, structuralSubject: 'UNIT_OR_STANDING_FUNCTION' }
        : features;
  }
}

export const BROADER_READINGS: readonly BroaderReading[] = Object.freeze([
  'PARTICIPATION_READ_AS_OWN_COMMITMENT',
  'INLINE_MENTION_READ_AS_OPERATOR',
  'UNIVERSITY_READ_AS_SMALL_ORGANISATION',
  'HOMEPAGE_READ_AS_STANDING_FUNCTION',
]);
