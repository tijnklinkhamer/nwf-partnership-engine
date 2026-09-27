/**
 * THE A3a ANALYSIS: PER ORGANISATION, WHAT SD7 DOES AND WHAT SD9 CAN BE TOLD.
 *
 * PURE. It takes rows in and returns numbers and verdicts out. It opens no
 * socket, no database and no file, and it prints nothing.
 *
 * THE THREE SD9 CASES, EXACTLY AS THE OWNER SPECIFIED THEM
 *
 *   A. SD9-ELIGIBLE PAGE COUNT = 0. The post-SD7 count is necessarily 0,
 *      because deduplication cannot create pages. This needs no dedupe
 *      assumption at all, so it is finalised outright as
 *      ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET - and notably it stays
 *      decidable even though SD7 carries unresolved detail elsewhere.
 *
 *      It covers TWO shapes: an organisation that produced no page-evidence
 *      row at all, and one whose every persisted row extracted to zero
 *      characters. Both yield zero pages WITH EXTRACTABLE TEXT, which is the
 *      population SD9's threshold ranges over.
 *
 *   B. NO UNRESOLVED AMBIGUITY, AND THE EXACT POST-SD7 COUNT IS KNOWN.
 *      >= 4 is ACQUISITION_SUCCESSFUL; < 4 is
 *      ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET.
 *
 *   C. AN UNRESOLVED AMBIGUITY COULD CHANGE WHETHER THE COUNT IS >= 4.
 *      ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL. No verdict is forced.
 *
 * WHAT "COULD CHANGE" MEANS, MECHANICALLY
 *
 *   The post-SD7 count is not a single number here; it is a RANGE, because two
 *   things are genuinely unresolved:
 *
 *     - survivor order. Over all orders the measurable survivors run from
 *       `measurableSurvivorsMin` to `measurableSurvivorsMax`. These are equal
 *       whenever every near-duplicate component is a clique.
 *     - short text. Each SD7_SHORT_TEXT_UNRESOLVED document either survives or
 *       does not, and R3 gives no rule to say which, so it contributes between
 *       0 and 1. A ZERO-CHARACTER page is NOT one of these: it never reaches
 *       the near-duplicate pass, because SD9 excludes it by its own wording
 *       (see `extractableText.ts`). Widening a range with it would assert that
 *       a page with no extracted text might be a page with extractable text.
 *
 *   The verdict is certain exactly when the WHOLE range falls on one side of
 *   MIN_PAGES_PER_ORGANISATION. If the range straddles it, case C applies. This
 *   is strictly weaker than picking an order and reporting one number, and that
 *   weakness is the point: the stronger answer is not A3a's to give.
 */
import {
  exactDuplicatePass,
  nearDuplicatePass,
  type ExactDuplicatePass,
  type NearDuplicatePass,
} from './nearDuplicatePairs.js';
import { partitionByExtractableText, type PageForSd7 } from './extractableText.js';
import {
  MIN_PAGES_PER_ORGANISATION,
  Sd7PilotStop,
  type Sd9PilotStatus,
  type Split,
} from './sd7Contract.js';

export interface OrganisationInput {
  readonly echeRowKey: string;
  readonly selectionIndex: number;
  readonly split: Split;
  /**
   * EVERY persisted `orgunit_page_evidence` row for this organisation's run,
   * RAW - including rows whose extraction yielded zero characters.
   *
   * The caller hands over the whole set and does not pre-filter it. Eligibility
   * for SD9 is decided HERE, by `partitionByExtractableText`, so that the raw
   * count and the eligible count are both derived from one reading of one set
   * and a caller cannot apply a different rule on the way in.
   */
  readonly pages: readonly PageForSd7[];
}

export interface OrganisationAnalysis {
  readonly echeRowKey: string;
  readonly selectionIndex: number;
  readonly split: Split;
  /**
   * EVERY persisted page-evidence row, including zero-extracted-text ones.
   *
   * The name and the meaning are unchanged from every record already written
   * with it: "how many `orgunit_page_evidence` rows this run produced". It is
   * NOT the SD9 population and must not be read as one.
   */
  readonly rawPageCount: number;
  /** The same number under an unambiguous name. */
  readonly rawPageEvidenceCount: number;
  /**
   * The rows with `mainTextChars > 0` - SD9's "pages with extractable text",
   * and the ONLY rows that enter deduplication.
   */
  readonly sd9ExtractableTextPageCount: number;
  /** `rawPageEvidenceCount - sd9ExtractableTextPageCount`. Recorded, never erased. */
  readonly zeroExtractedTextPageCount: number;
  readonly exact: ExactDuplicatePass;
  /** Absent when the organisation produced no page at all: case A needs no pass. */
  readonly near: NearDuplicatePass | null;
  readonly postSd7CountMin: number;
  readonly postSd7CountMax: number;
  readonly countIsExact: boolean;
  readonly shortTextUnresolvedCount: number;
  readonly nonTransitiveComponentCount: number;
  readonly unauditableComponentCount: number;
  readonly survivorCountIsOrderDependent: boolean;
  readonly survivorIdentityIsOrderDependent: boolean;
  readonly sd9Status: Sd9PilotStatus;
  readonly sd9DecisionIsOrderDependent: boolean;
  readonly sd9DecisionIsShortTextDependent: boolean;
  readonly decidedByCase: 'A' | 'B' | 'C';
}

export function analyseOrganisation(input: OrganisationInput): OrganisationAnalysis {
  const rawPageCount = input.pages.length;

  // ---- SD9'S OWN PREREQUISITE, APPLIED BEFORE ANYTHING ELSE --------------
  // SD9 counts "distinct pages WITH EXTRACTABLE TEXT". A persisted row whose
  // extraction is zero characters long is not one, so it is removed from the
  // population here - and counted, never erased. See `extractableText.ts` and
  // SD9_EXTRACTABLE_TEXT_REQUIRES_NONEMPTY_EXTRACTED_MAIN_TEXT_V1.
  const partition = partitionByExtractableText(input.pages);
  const eligiblePages = partition.eligible;

  // ---- CASE A -----------------------------------------------------------
  // Deduplication is a removal operation. It has no branch that produces a
  // page, so zero ELIGIBLE pages in means zero pages out under every possible
  // reading of every unresolved detail. This is the one verdict A3a can
  // finalise with no SD7 assumption whatsoever, and it covers both an
  // organisation that produced no page at all and one whose every page
  // extracted to nothing.
  if (partition.sd9ExtractableTextPageCount === 0) {
    return {
      echeRowKey: input.echeRowKey,
      selectionIndex: input.selectionIndex,
      split: input.split,
      rawPageCount,
      rawPageEvidenceCount: partition.rawPageEvidenceCount,
      sd9ExtractableTextPageCount: 0,
      zeroExtractedTextPageCount: partition.zeroExtractedTextPageCount,
      exact: exactDuplicatePass([]),
      near: null,
      postSd7CountMin: 0,
      postSd7CountMax: 0,
      countIsExact: true,
      shortTextUnresolvedCount: 0,
      nonTransitiveComponentCount: 0,
      unauditableComponentCount: 0,
      survivorCountIsOrderDependent: false,
      survivorIdentityIsOrderDependent: false,
      sd9Status: 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET',
      sd9DecisionIsOrderDependent: false,
      sd9DecisionIsShortTextDependent: false,
      decidedByCase: 'A',
    };
  }

  const exact = exactDuplicatePass(eligiblePages);

  // The text lookup exists so that page bytes reach the shingler and nothing
  // else. Every member of an exact-duplicate group is byte-identical, so the
  // first member's text represents the group; divergence is refused upstream.
  const textByHash = new Map<string, string>();
  for (const page of eligiblePages) {
    if (!textByHash.has(page.documentSha256)) textByHash.set(page.documentSha256, page.mainText);
  }
  const near = nearDuplicatePass(exact.groups, (hash) => {
    const text = textByHash.get(hash);
    if (text === undefined) throw new Sd7PilotStop(`STOP: no text for document ${hash}.`);
    return text;
  });

  const shortText = near.shortTextUnresolvedCount;
  const postSd7CountMin = near.measurableSurvivorsMin;
  const postSd7CountMax = near.measurableSurvivorsMax + shortText;
  const countIsExact = postSd7CountMin === postSd7CountMax;

  // ---- CASES B AND C ----------------------------------------------------
  const minMeetsMinimum = postSd7CountMin >= MIN_PAGES_PER_ORGANISATION;
  const maxMeetsMinimum = postSd7CountMax >= MIN_PAGES_PER_ORGANISATION;
  const verdictIsCertain =
    minMeetsMinimum === maxMeetsMinimum && near.unauditableComponentCount === 0;

  // WHICH unresolved detail is actually load-bearing, asked one at a time.
  // "The verdict is uncertain" is not enough for the owner: the next decision
  // differs depending on which detail would have to be settled to remove it.
  //
  // Each flag holds the OTHER detail at its most generous reading and varies
  // only its own, so a true flag means that detail alone can flip the verdict.
  // Both can be false while the verdict is still uncertain - that is the case
  // where only the COMBINATION straddles the minimum, and the organisation
  // still reports PENDING.
  const orderOnlyMin = near.measurableSurvivorsMin + shortText;
  const sd9DecisionIsOrderDependent =
    !verdictIsCertain && orderOnlyMin >= MIN_PAGES_PER_ORGANISATION !== maxMeetsMinimum;
  const shortTextOnlyMax = near.measurableSurvivorsMax;
  const sd9DecisionIsShortTextDependent =
    !verdictIsCertain &&
    shortText > 0 &&
    shortTextOnlyMax >= MIN_PAGES_PER_ORGANISATION !== maxMeetsMinimum;

  const sd9Status: Sd9PilotStatus = verdictIsCertain
    ? minMeetsMinimum
      ? 'ACQUISITION_SUCCESSFUL'
      : 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'
    : 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';

  return {
    echeRowKey: input.echeRowKey,
    selectionIndex: input.selectionIndex,
    split: input.split,
    rawPageCount,
    rawPageEvidenceCount: partition.rawPageEvidenceCount,
    sd9ExtractableTextPageCount: partition.sd9ExtractableTextPageCount,
    zeroExtractedTextPageCount: partition.zeroExtractedTextPageCount,
    exact,
    near,
    postSd7CountMin,
    postSd7CountMax,
    countIsExact,
    shortTextUnresolvedCount: shortText,
    nonTransitiveComponentCount: near.nonTransitiveComponentCount,
    unauditableComponentCount: near.unauditableComponentCount,
    survivorCountIsOrderDependent: !near.survivorCountIsOrderInvariant,
    survivorIdentityIsOrderDependent: near.survivorIdentityIsOrderDependent,
    sd9Status,
    sd9DecisionIsOrderDependent,
    sd9DecisionIsShortTextDependent,
    decidedByCase: verdictIsCertain ? 'B' : 'C',
  };
}

// ---------------------------------------------------------------------------
// The whole pilot
// ---------------------------------------------------------------------------

export interface PilotAggregate {
  readonly organisationsAnalysed: number;
  /** EVERY persisted page-evidence row, including zero-extracted-text ones. */
  readonly rawPageEvidenceRows: number;
  /** The subset with `mainTextChars > 0`: SD9's population. */
  readonly sd9ExtractableTextPageRows: number;
  /** `rawPageEvidenceRows - sd9ExtractableTextPageRows`. */
  readonly zeroExtractedTextPageRows: number;
  readonly organisationsWithZeroExtractedTextPages: number;
  /** Organisations whose every persisted page extracted to nothing. */
  readonly organisationsWithNoExtractableTextPageAtAll: number;
  readonly exactDuplicateRowsRemoved: number;
  readonly exactDuplicateGroupCount: number;
  readonly distinctDocumentCount: number;
  readonly nearDuplicateEdgeCount: number;
  readonly organisationsWithNearDuplicates: number;
  readonly organisationsWithNoNearDuplicates: number;
  readonly shortTextUnresolvedPageCount: number;
  readonly organisationsWithShortTextUnresolvedPages: number;
  readonly nonTransitiveComponentCount: number;
  readonly organisationsWithNonTransitiveComponents: number;
  readonly unauditableComponentCount: number;
  readonly organisationsWhoseSurvivorIdentityIsOrderDependent: number;
  readonly organisationsWhoseSurvivorCountIsOrderDependent: number;
  readonly organisationsWhoseSd9DecisionIsOrderDependent: number;
  readonly sd9SuccessCount: number;
  readonly sd9FailureCount: number;
  readonly sd9PendingOwnerDetailCount: number;
  readonly zeroRawPageOrganisationCount: number;
  readonly maximumPossibleSuccessesInThisBatch: number;
}

export interface PilotResult {
  readonly organisations: readonly OrganisationAnalysis[];
  readonly aggregate: PilotAggregate;
  readonly shortTextAmbiguityOccurred: boolean;
  readonly survivorAmbiguityCanAffectSd9: boolean;
  readonly shortTextAmbiguityCanAffectSd9: boolean;
  readonly anySd7AmbiguityCanAffectSd9: boolean;
}

export function analysePilot(inputs: readonly OrganisationInput[]): PilotResult {
  const organisations = inputs.map(analyseOrganisation);

  const sum = (pick: (a: OrganisationAnalysis) => number): number =>
    organisations.reduce((total, a) => total + pick(a), 0);
  const count = (pick: (a: OrganisationAnalysis) => boolean): number =>
    organisations.filter(pick).length;

  const withNearDuplicates = count((a) => (a.near?.edgeCount ?? 0) > 0);
  const zeroRawPage = count((a) => a.rawPageCount === 0);
  const zeroEligiblePage = count((a) => a.sd9ExtractableTextPageCount === 0);

  const aggregate: PilotAggregate = {
    organisationsAnalysed: organisations.length,
    rawPageEvidenceRows: sum((a) => a.rawPageEvidenceCount),
    sd9ExtractableTextPageRows: sum((a) => a.sd9ExtractableTextPageCount),
    zeroExtractedTextPageRows: sum((a) => a.zeroExtractedTextPageCount),
    organisationsWithZeroExtractedTextPages: count((a) => a.zeroExtractedTextPageCount > 0),
    organisationsWithNoExtractableTextPageAtAll: zeroEligiblePage,
    exactDuplicateRowsRemoved: sum((a) => a.exact.duplicateRowsRemoved),
    exactDuplicateGroupCount: sum((a) => a.exact.duplicateGroupCount),
    distinctDocumentCount: sum((a) => a.exact.distinctDocumentCount),
    nearDuplicateEdgeCount: sum((a) => a.near?.edgeCount ?? 0),
    organisationsWithNearDuplicates: withNearDuplicates,
    organisationsWithNoNearDuplicates: organisations.length - withNearDuplicates,
    shortTextUnresolvedPageCount: sum((a) => a.shortTextUnresolvedCount),
    organisationsWithShortTextUnresolvedPages: count((a) => a.shortTextUnresolvedCount > 0),
    nonTransitiveComponentCount: sum((a) => a.nonTransitiveComponentCount),
    organisationsWithNonTransitiveComponents: count((a) => a.nonTransitiveComponentCount > 0),
    unauditableComponentCount: sum((a) => a.unauditableComponentCount),
    organisationsWhoseSurvivorIdentityIsOrderDependent: count(
      (a) => a.survivorIdentityIsOrderDependent,
    ),
    organisationsWhoseSurvivorCountIsOrderDependent: count((a) => a.survivorCountIsOrderDependent),
    organisationsWhoseSd9DecisionIsOrderDependent: count((a) => a.sd9DecisionIsOrderDependent),
    sd9SuccessCount: count((a) => a.sd9Status === 'ACQUISITION_SUCCESSFUL'),
    sd9FailureCount: count((a) => a.sd9Status === 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'),
    sd9PendingOwnerDetailCount: count(
      (a) => a.sd9Status === 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL',
    ),
    zeroRawPageOrganisationCount: zeroRawPage,
    // An organisation with no SD9-ELIGIBLE page cannot become a success under
    // any reading, so the ceiling on this batch is everything that is not one
    // of them. That set contains every zero-raw-page organisation and, since
    // SD9_EXTRACTABLE_TEXT_REQUIRES_NONEMPTY_EXTRACTED_MAIN_TEXT_V1, every
    // organisation whose pages all extracted to nothing as well.
    maximumPossibleSuccessesInThisBatch: organisations.length - zeroEligiblePage,
  };

  const survivorAmbiguityCanAffectSd9 =
    aggregate.organisationsWhoseSd9DecisionIsOrderDependent > 0 ||
    aggregate.unauditableComponentCount > 0;
  const shortTextAmbiguityCanAffectSd9 = count((a) => a.sd9DecisionIsShortTextDependent) > 0;

  return {
    organisations,
    aggregate,
    shortTextAmbiguityOccurred: aggregate.shortTextUnresolvedPageCount > 0,
    survivorAmbiguityCanAffectSd9,
    shortTextAmbiguityCanAffectSd9,
    // Derived from the PENDING count rather than from the two attribution flags
    // above, so that the combination-only case - where neither detail alone can
    // flip a verdict but together they can - is never reported as "no ambiguity
    // affects SD9". A pending organisation is, by definition, one whose SD9
    // verdict an SD7 ambiguity is currently deciding.
    anySd7AmbiguityCanAffectSd9:
      aggregate.sd9PendingOwnerDetailCount > 0 || aggregate.unauditableComponentCount > 0,
  };
}
