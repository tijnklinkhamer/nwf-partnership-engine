/**
 * ECHE <-> EWP identifier coverage measurement.
 *
 * WHAT "MATCH" MEANS HERE, EXACTLY:
 *
 *   "the same official identifier value appears in both official datasets"
 *
 * WHAT IT DOES NOT MEAN:
 *
 *   "these two records are the same real-world institution, and we have merged
 *    them into one verified NWF entity"
 *
 * Nothing in this module merges, deduplicates, aliases, scores, or marks
 * anything verified, and it never picks a winner when two identifiers disagree.
 * A disagreement is an OUTPUT, not a problem to resolve. Entity resolution is a
 * later gated phase, and this measurement is one of its inputs.
 *
 * WHY THIS IS PURE AND ARTIFACT-TO-ARTIFACT.
 *
 * The comparison takes the two source artifacts and returns a report. It opens
 * no database connection and holds no pool, so the authoritative measurement
 * over all 6139 ECHE rows cannot depend on - or disturb - whatever subset
 * happens to be loaded into a working database. That is a correctness property
 * as much as a safety one: a partially-ingested database would silently give a
 * wrong denominator.
 */
import { parseEcheWorkbook, type RawEcheRow } from '../ingest/eche/parse.js';
import { blankToNull, normaliseErasmusCode } from '../ingest/eche/normalise.js';
import { canonicalDomain, normaliseWebsiteUrl } from '../ingest/eche/normalise.js';
import { parseEwpCatalogue } from '../ingest/ewp/parse.js';
import { comparableValues, normaliseHei, normalisePic } from '../ingest/ewp/normalise.js';

/**
 * The verdict for ONE identifier of ONE ECHE row. These four are kept apart on
 * purpose - collapsing UNKNOWN into NO_MATCH would silently convert "we could
 * not look" into "we looked and found nothing".
 */
export type IdentifierVerdict =
  /** The identifier is present in ECHE and names exactly one EWP HEI. */
  | 'MATCH'
  /** Present, and names MORE THAN ONE EWP HEI. Ambiguous, not resolved. */
  | 'MATCH_MULTI'
  /** Present in ECHE, absent from EWP. */
  | 'NO_MATCH'
  /** Not comparable at all: absent from the ECHE row, or not normalisable. */
  | 'UNKNOWN';

/**
 * The combined verdict for one ECHE row across both identifiers.
 *
 * AMBIGUITY IS NEVER COLLAPSED INTO A UNIQUE MATCH, on either side.
 *
 * A single matching identifier is not automatically a single institution: an
 * identifier CAN name several EWP HEIs (unisi.ch and usi.ch publish the same
 * PIC and the same Erasmus code). A row whose PIC reached two HEIs while its
 * Erasmus code reached nothing has NOT identified an institution, and calling
 * that MATCH_PIC_ONLY alongside rows that reached exactly one would report
 * ambiguous evidence as a unique match. The one-sided verdicts are therefore
 * split by cardinality, exactly as the two-sided ones already were.
 */
export type RowVerdict =
  /** Both matched, each named exactly one EWP HEI, and it is the same one. */
  | 'MATCH_BOTH_AGREE'
  /** Both matched, but they name DISJOINT sets of EWP HEIs. The conflict set. */
  | 'MATCH_BOTH_CONFLICT'
  /** Both matched and overlap, but at least one side named several HEIs. */
  | 'MATCH_BOTH_AMBIGUOUS'
  /** Only the PIC matched, and it named exactly one EWP HEI. */
  | 'MATCH_PIC_ONLY'
  /** Only the PIC matched, and it named SEVERAL EWP HEIs. Not a unique match. */
  | 'MATCH_PIC_ONLY_AMBIGUOUS'
  /** Only the Erasmus code matched, and it named exactly one EWP HEI. */
  | 'MATCH_ERASMUS_ONLY'
  /** Only the Erasmus code matched, and it named SEVERAL. Not a unique match. */
  | 'MATCH_ERASMUS_ONLY_AMBIGUOUS'
  /** Neither identifier reached an EWP HEI. */
  | 'NO_MATCH';

/**
 * The coarse grade of a row-level verdict, and the partition the headline
 * numbers are built from.
 *
 * UNUSABLE is deliberately NOT a RowVerdict: an unusable row never reached the
 * comparison at all, so it has no per-identifier evidence to report. It is
 * counted, and it stays inside the denominator - see EcheEwpCoverageReport.
 */
export type MatchGrade = 'UNIQUE' | 'AMBIGUOUS' | 'CONFLICT' | 'NO_MATCH';

/** Maps a row verdict onto its grade. Total over RowVerdict, by construction. */
export function gradeOf(verdict: RowVerdict): MatchGrade {
  switch (verdict) {
    case 'MATCH_BOTH_AGREE':
    case 'MATCH_PIC_ONLY':
    case 'MATCH_ERASMUS_ONLY':
      return 'UNIQUE';
    case 'MATCH_BOTH_AMBIGUOUS':
    case 'MATCH_PIC_ONLY_AMBIGUOUS':
    case 'MATCH_ERASMUS_ONLY_AMBIGUOUS':
      return 'AMBIGUOUS';
    case 'MATCH_BOTH_CONFLICT':
      return 'CONFLICT';
    case 'NO_MATCH':
      return 'NO_MATCH';
  }
}

export interface EcheComparableRow {
  echeRowKey: string;
  legalName: string;
  countryCode: string;
  /** Normalised Erasmus code, or null when it could not be normalised. */
  erasmusCode: string | null;
  /** Trimmed all-digit PIC, or null. */
  pic: string | null;
  /** Registrable domain from the ECHE website. ENRICHMENT, never identity. */
  canonicalDomain: string | null;
}

export interface EwpComparableHei {
  heiId: string;
  heiIdFolded: string;
  /** Distinct normalised Erasmus codes carried by this HEI. May be 0, 1 or 2+. */
  erasmusCodes: string[];
  /** Distinct normalised PICs carried by this HEI. May be 0, 1 or 2+. */
  pics: string[];
  primaryName: string | null;
}

export interface RowComparison {
  echeRowKey: string;
  legalName: string;
  countryCode: string;
  erasmusCode: string | null;
  pic: string | null;
  picVerdict: IdentifierVerdict;
  erasmusVerdict: IdentifierVerdict;
  verdict: RowVerdict;
  /** The coarse grade of `verdict`. UNIQUE never covers ambiguous evidence. */
  grade: MatchGrade;
  /** EWP HEI ids reached via PIC. */
  picHeiIds: string[];
  /** EWP HEI ids reached via Erasmus code. */
  erasmusHeiIds: string[];
}

export interface DuplicateIdentifier {
  /** The normalised identifier value. */
  value: string;
  /** The EWP HEI ids that all publish it. */
  heiIds: string[];
}

export interface MultiIdentifierHei {
  heiId: string;
  values: string[];
}

export interface EcheEwpCoverageReport {
  eche: {
    /**
     * A. EVERY data row in the ECHE artifact - the denominator, full stop.
     * Equal to `comparableRows + unusableRows`.
     */
    totalSourceRows: number;
    /** Rows that yielded an Erasmus code and a name, so could be compared. */
    comparableRows: number;
    /**
     * Rows that could not be compared at all: no Erasmus code, or no legal
     * name. Reported, never repaired, and NEVER counted as NO MATCH - "we
     * could not compare this row" is a different finding from "we compared it
     * and EWP published no matching identifier".
     */
    unusableRows: number;
    /** C. Rows carrying a usable PIC. */
    rowsWithPic: number;
    /** D. Rows carrying a usable Erasmus code. */
    rowsWithErasmusCode: number;
    /** Distinct normalised values within ECHE itself. */
    distinctPics: number;
    distinctErasmusCodes: number;
  };
  ewp: {
    /** B. HEI entries in the EWP artifact. */
    totalHeis: number;
    totalHosts: number;
    heisWithPic: number;
    heisWithErasmusCode: number;
    distinctPics: number;
    distinctErasmusCodes: number;
    /** Identifiers published with an empty value. */
    emptyOtherIds: number;
    /** PIC values that are not all digits and so have no comparison value. */
    nonComparablePics: number;
  };
  coverage: {
    /** E. */ matchedByPic: number;
    /** F. */ matchedByErasmus: number;
    /** G. */ matchedByBoth: number;
    /** H. Only the PIC matched, at any cardinality. */
    matchedByPicOnly: number;
    /** I. Only the Erasmus code matched, at any cardinality. */
    matchedByErasmusOnly: number;
    /** J. */ matchedByEither: number;
    /** K. */ matchedByNeither: number;
    /** Both matched, each named exactly one HEI, and it is the same one. */
    bothAgree: number;
    /** L. Rows where both matched and they DISAGREE. */
    bothConflict: number;
    /** Rows where both matched, overlap, but at least one side named several. */
    bothAmbiguous: number;
    /** Of H: the PIC named exactly one EWP HEI. A unique match. */
    picOnlyUnique: number;
    /** Of H: the PIC named SEVERAL. Ambiguous, never a unique match. */
    picOnlyAmbiguous: number;
    /** Of I: the Erasmus code named exactly one EWP HEI. A unique match. */
    erasmusOnlyUnique: number;
    /** Of I: the Erasmus code named SEVERAL. Ambiguous, never a unique match. */
    erasmusOnlyAmbiguous: number;
    /** Rows whose PIC named more than one EWP HEI, whatever the other side did. */
    picAmbiguous: number;
    /** Rows whose Erasmus code named more than one EWP HEI. */
    erasmusAmbiguous: number;
  };
  /**
   * THE HEADLINE PARTITION OF EVERY ECHE SOURCE ROW. Exhaustive and disjoint:
   *
   *   unique + ambiguous + conflict + noMatch + unusable === totalSourceRows
   *
   * `unusable` is inside the denominator because the denominator is the
   * artifact, not the subset of it this comparison happened to be able to read.
   */
  classification: {
    totalSourceRows: number;
    /** Reached exactly one EWP HEI, with no disagreement. */
    unique: number;
    /** Reached EWP evidence, but not a single institution. */
    ambiguous: number;
    /** The two identifiers named disjoint sets of EWP HEIs. */
    conflict: number;
    /** Compared, and no EWP HEI published either identifier. */
    noMatch: number;
    /** Not comparable at all. NOT a miss. */
    unusable: number;
  };
  reverse: {
    /** EWP HEIs reached by at least one ECHE row, via either identifier. */
    heisMatchedByAnyEcheRow: number;
    /** EWP HEIs no ECHE row reached. */
    heisNotMatchedByAnyEcheRow: number;
  };
  ambiguity: {
    /** One normalised PIC published by more than one EWP HEI. */
    ewpPicSharedByMultipleHeis: DuplicateIdentifier[];
    /** One normalised Erasmus code published by more than one EWP HEI. */
    ewpErasmusSharedByMultipleHeis: DuplicateIdentifier[];
    /** One EWP HEI carrying two or more distinct normalised PICs. */
    ewpHeisWithMultiplePics: MultiIdentifierHei[];
    /** One EWP HEI carrying two or more distinct normalised Erasmus codes. */
    ewpHeisWithMultipleErasmusCodes: MultiIdentifierHei[];
    /** One normalised PIC appearing on more than one ECHE row. */
    echePicSharedByMultipleRows: DuplicateIdentifier[];
    /** One normalised Erasmus code appearing on more than one ECHE row. */
    echeErasmusSharedByMultipleRows: DuplicateIdentifier[];
  };
  /**
   * ANALYTICAL ONLY. See the comment on `measureDomainShapeOverlap`.
   * A domain-shaped identifier comparison is NOT website verification.
   */
  domainShapeAnalysis: {
    echeRowsWithCanonicalDomain: number;
    /** ECHE canonical_domain equal to some EWP SCHAC identifier, case-folded. */
    echeDomainEqualsSomeSchacId: number;
    /** Of those, how many ALSO matched that same HEI on PIC or Erasmus code. */
    andAlsoIdentifierMatchedSameHei: number;
    /** Of those, how many did NOT - i.e. the domain equality stands alone. */
    andDidNotIdentifierMatchSameHei: number;
  };
  /** The full disagreement set. Reported, never resolved. */
  conflicts: RowComparison[];
  /** The full ambiguity set: rows that reached evidence but not one institution. */
  ambiguousRows: RowComparison[];
  /** Every row's classification, in ECHE document order. */
  rows: RowComparison[];
}

/** Index from a normalised identifier value to the EWP HEIs publishing it. */
type IdentifierIndex = Map<string, string[]>;

function indexBy(heis: readonly EwpComparableHei[], pick: (h: EwpComparableHei) => string[]) {
  const index: IdentifierIndex = new Map();
  for (const hei of heis) {
    for (const value of pick(hei)) {
      const bucket = index.get(value);
      if (bucket === undefined) index.set(value, [hei.heiId]);
      else if (!bucket.includes(hei.heiId)) bucket.push(hei.heiId);
    }
  }
  return index;
}

function duplicatesOf(index: IdentifierIndex): DuplicateIdentifier[] {
  const out: DuplicateIdentifier[] = [];
  for (const [value, heiIds] of index) {
    if (heiIds.length > 1) out.push({ value, heiIds: [...heiIds].sort() });
  }
  return out.sort((a, b) => a.value.localeCompare(b.value));
}

function verdictFor(value: string | null, hits: readonly string[]): IdentifierVerdict {
  if (value === null) return 'UNKNOWN';
  if (hits.length === 0) return 'NO_MATCH';
  return hits.length === 1 ? 'MATCH' : 'MATCH_MULTI';
}

/** Converts EWP parse output into the shape the comparison needs. */
export function toComparableHeis(ewpXmlBytes: Buffer): {
  heis: EwpComparableHei[];
  totalHosts: number;
  emptyOtherIds: number;
  nonComparablePics: number;
} {
  const parsed = parseEwpCatalogue(ewpXmlBytes);
  let nonComparablePics = 0;
  const heis = parsed.heis.map((raw) => {
    const hei = normaliseHei(raw);
    for (const other of hei.otherIds) {
      if (other.typeFolded === 'pic' && other.valueNormalised === null) nonComparablePics += 1;
    }
    return {
      heiId: hei.heiId,
      heiIdFolded: hei.heiIdFolded,
      erasmusCodes: comparableValues(hei, 'erasmus'),
      pics: comparableValues(hei, 'pic'),
      primaryName: hei.names[0]?.value ?? null,
    };
  });
  return {
    heis,
    totalHosts: parsed.hosts.length,
    emptyOtherIds: parsed.anomalies.filter((a) => a.kind === 'empty_other_id_value').length,
    nonComparablePics,
  };
}

/**
 * Converts one raw ECHE row into its comparable identifiers.
 *
 * Deliberately more permissive than Phase 1A's `normaliseRow`, which throws on
 * a row that could not become an organisation. A row missing a country code
 * still counts as a row; it simply contributes null identifiers.
 *
 * Returns null for a row that cannot be compared at all - no Erasmus code, or
 * no legal name. Such a row is NOT dropped from the measurement: the caller
 * counts it as `unusableRows`, it stays inside `totalSourceRows`, and it is
 * never folded into NO MATCH.
 */
export function toComparableRow(row: RawEcheRow): EcheComparableRow | null {
  const rawCode = blankToNull(row['Erasmus code'] ?? null);
  const legalName = blankToNull(row['Legal Name'] ?? null);
  if (rawCode === null || legalName === null) return null;

  const normalisedCode = normaliseErasmusCode(rawCode);
  const rawPic = blankToNull(row['PIC'] ?? null);
  const website = normaliseWebsiteUrl(row['Website Url'] ?? null);

  return {
    echeRowKey: `${normalisedCode}|${rawPic ?? ''}`,
    legalName,
    countryCode: blankToNull(row['Country Cd'] ?? null)?.toUpperCase() ?? '??',
    erasmusCode: normalisedCode === '' ? null : normalisedCode,
    pic: rawPic === null ? null : normalisePic(rawPic),
    canonicalDomain: canonicalDomain(website),
  };
}

function countDistinct(values: Iterable<string | null>): number {
  const seen = new Set<string>();
  for (const value of values) if (value !== null) seen.add(value);
  return seen.size;
}

function duplicateEcheValues(
  rows: readonly EcheComparableRow[],
  pick: (r: EcheComparableRow) => string | null,
): DuplicateIdentifier[] {
  const index = new Map<string, string[]>();
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    const bucket = index.get(value);
    if (bucket === undefined) index.set(value, [row.echeRowKey]);
    else bucket.push(row.echeRowKey);
  }
  const out: DuplicateIdentifier[] = [];
  for (const [value, heiIds] of index) {
    if (heiIds.length > 1) out.push({ value, heiIds });
  }
  return out.sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * ANALYTICAL ONLY - and this distinction is the whole point of the function.
 *
 * A SCHAC identifier is domain-SHAPED. Comparing it to a domain derived from an
 * ECHE website tells you that two strings are equal; it does NOT verify that
 * either one is the institution's website, and it establishes no semantic
 * equivalence between "identifier" and "web address". The live catalogue
 * publishes "0740047Z.educonnect.education.gouv.fr" as a SCHAC id, which is
 * plainly a registry key and not a site.
 *
 * The result is therefore reported and nothing else. It causes no mutation, it
 * is never used as a matching key, and it must never be promoted into one.
 *
 *   domain-shaped identifier comparison != website verification
 */
function measureDomainShapeOverlap(
  rows: readonly EcheComparableRow[],
  comparisons: readonly RowComparison[],
  heiIdsFolded: ReadonlyMap<string, string>,
): EcheEwpCoverageReport['domainShapeAnalysis'] {
  let withDomain = 0;
  let equalsSchac = 0;
  let alsoMatched = 0;
  let notAlsoMatched = 0;

  rows.forEach((row, index) => {
    if (row.canonicalDomain === null) return;
    withDomain += 1;
    const heiId = heiIdsFolded.get(row.canonicalDomain);
    if (heiId === undefined) return;
    equalsSchac += 1;
    const comparison = comparisons[index];
    const reached = new Set([
      ...(comparison?.picHeiIds ?? []),
      ...(comparison?.erasmusHeiIds ?? []),
    ]);
    if (reached.has(heiId)) alsoMatched += 1;
    else notAlsoMatched += 1;
  });

  return {
    echeRowsWithCanonicalDomain: withDomain,
    echeDomainEqualsSomeSchacId: equalsSchac,
    andAlsoIdentifierMatchedSameHei: alsoMatched,
    andDidNotIdentifierMatchSameHei: notAlsoMatched,
  };
}

/**
 * Compares already-extracted rows and HEIs. Pure; the unit tests drive this.
 *
 * `echeUnusableRows` is the count of source rows that could not be turned into
 * an `EcheComparableRow` at all. They are not in `echeRows` - there is nothing
 * to compare - but they ARE part of the reported denominator, so passing the
 * real count is what keeps `totalSourceRows` the size of the artifact rather
 * than the size of the readable subset of it.
 */
export function compareEcheToEwp(
  echeRows: readonly EcheComparableRow[],
  ewp: {
    heis: readonly EwpComparableHei[];
    totalHosts: number;
    emptyOtherIds: number;
    nonComparablePics: number;
  },
  echeUnusableRows = 0,
): EcheEwpCoverageReport {
  const picIndex = indexBy(ewp.heis, (h) => h.pics);
  const erasmusIndex = indexBy(ewp.heis, (h) => h.erasmusCodes);

  const foldedHeiIds = new Map<string, string>();
  for (const hei of ewp.heis) {
    if (!foldedHeiIds.has(hei.heiIdFolded)) foldedHeiIds.set(hei.heiIdFolded, hei.heiId);
  }

  const rows: RowComparison[] = [];
  const reachedHeis = new Set<string>();

  let matchedByPic = 0;
  let matchedByErasmus = 0;
  let matchedByBoth = 0;
  let matchedByPicOnly = 0;
  let matchedByErasmusOnly = 0;
  let matchedByNeither = 0;
  let bothAgree = 0;
  let bothConflict = 0;
  let bothAmbiguous = 0;
  let picOnlyUnique = 0;
  let picOnlyAmbiguous = 0;
  let erasmusOnlyUnique = 0;
  let erasmusOnlyAmbiguous = 0;
  let picAmbiguous = 0;
  let erasmusAmbiguous = 0;
  let gradeUnique = 0;
  let gradeAmbiguous = 0;
  let gradeConflict = 0;

  for (const row of echeRows) {
    const picHeiIds = row.pic === null ? [] : (picIndex.get(row.pic) ?? []);
    const erasmusHeiIds = row.erasmusCode === null ? [] : (erasmusIndex.get(row.erasmusCode) ?? []);

    const picVerdict = verdictFor(row.pic, picHeiIds);
    const erasmusVerdict = verdictFor(row.erasmusCode, erasmusHeiIds);

    const picHit = picHeiIds.length > 0;
    const erasmusHit = erasmusHeiIds.length > 0;

    if (picHit) matchedByPic += 1;
    if (erasmusHit) matchedByErasmus += 1;
    if (picVerdict === 'MATCH_MULTI') picAmbiguous += 1;
    if (erasmusVerdict === 'MATCH_MULTI') erasmusAmbiguous += 1;

    for (const heiId of picHeiIds) reachedHeis.add(heiId);
    for (const heiId of erasmusHeiIds) reachedHeis.add(heiId);

    let verdict: RowVerdict;
    if (picHit && erasmusHit) {
      matchedByBoth += 1;
      const overlap = picHeiIds.filter((heiId) => erasmusHeiIds.includes(heiId));
      if (overlap.length === 0) {
        // THE DISAGREEMENT SET. PIC says one institution, the Erasmus code says
        // a different one. Both are official identifiers from official sources.
        // Neither is preferred and neither is discarded.
        verdict = 'MATCH_BOTH_CONFLICT';
        bothConflict += 1;
      } else if (picHeiIds.length === 1 && erasmusHeiIds.length === 1) {
        verdict = 'MATCH_BOTH_AGREE';
        bothAgree += 1;
      } else {
        verdict = 'MATCH_BOTH_AMBIGUOUS';
        bothAmbiguous += 1;
      }
    } else if (picHit) {
      // ONE MATCHING IDENTIFIER IS NOT AUTOMATICALLY ONE INSTITUTION. A PIC
      // that names two EWP HEIs is ambiguous evidence even when the other
      // identifier found nothing to disagree with, so it never grades UNIQUE.
      matchedByPicOnly += 1;
      if (picHeiIds.length === 1) {
        verdict = 'MATCH_PIC_ONLY';
        picOnlyUnique += 1;
      } else {
        verdict = 'MATCH_PIC_ONLY_AMBIGUOUS';
        picOnlyAmbiguous += 1;
      }
    } else if (erasmusHit) {
      matchedByErasmusOnly += 1;
      if (erasmusHeiIds.length === 1) {
        verdict = 'MATCH_ERASMUS_ONLY';
        erasmusOnlyUnique += 1;
      } else {
        verdict = 'MATCH_ERASMUS_ONLY_AMBIGUOUS';
        erasmusOnlyAmbiguous += 1;
      }
    } else {
      verdict = 'NO_MATCH';
      matchedByNeither += 1;
    }

    const grade = gradeOf(verdict);
    if (grade === 'UNIQUE') gradeUnique += 1;
    else if (grade === 'AMBIGUOUS') gradeAmbiguous += 1;
    else if (grade === 'CONFLICT') gradeConflict += 1;

    rows.push({
      echeRowKey: row.echeRowKey,
      legalName: row.legalName,
      countryCode: row.countryCode,
      erasmusCode: row.erasmusCode,
      pic: row.pic,
      picVerdict,
      erasmusVerdict,
      verdict,
      grade,
      picHeiIds,
      erasmusHeiIds,
    });
  }

  const heisWithPic = ewp.heis.filter((h) => h.pics.length > 0).length;
  const heisWithErasmus = ewp.heis.filter((h) => h.erasmusCodes.length > 0).length;

  return {
    eche: {
      totalSourceRows: echeRows.length + echeUnusableRows,
      comparableRows: echeRows.length,
      unusableRows: echeUnusableRows,
      rowsWithPic: echeRows.filter((r) => r.pic !== null).length,
      rowsWithErasmusCode: echeRows.filter((r) => r.erasmusCode !== null).length,
      distinctPics: countDistinct(echeRows.map((r) => r.pic)),
      distinctErasmusCodes: countDistinct(echeRows.map((r) => r.erasmusCode)),
    },
    ewp: {
      totalHeis: ewp.heis.length,
      totalHosts: ewp.totalHosts,
      heisWithPic,
      heisWithErasmusCode: heisWithErasmus,
      distinctPics: picIndex.size,
      distinctErasmusCodes: erasmusIndex.size,
      emptyOtherIds: ewp.emptyOtherIds,
      nonComparablePics: ewp.nonComparablePics,
    },
    coverage: {
      matchedByPic,
      matchedByErasmus,
      matchedByBoth,
      matchedByPicOnly,
      matchedByErasmusOnly,
      matchedByEither: matchedByPic + matchedByErasmus - matchedByBoth,
      matchedByNeither,
      bothAgree,
      bothConflict,
      bothAmbiguous,
      picOnlyUnique,
      picOnlyAmbiguous,
      erasmusOnlyUnique,
      erasmusOnlyAmbiguous,
      picAmbiguous,
      erasmusAmbiguous,
    },
    classification: {
      totalSourceRows: echeRows.length + echeUnusableRows,
      unique: gradeUnique,
      ambiguous: gradeAmbiguous,
      conflict: gradeConflict,
      noMatch: matchedByNeither,
      unusable: echeUnusableRows,
    },
    reverse: {
      heisMatchedByAnyEcheRow: reachedHeis.size,
      heisNotMatchedByAnyEcheRow: ewp.heis.length - reachedHeis.size,
    },
    ambiguity: {
      ewpPicSharedByMultipleHeis: duplicatesOf(picIndex),
      ewpErasmusSharedByMultipleHeis: duplicatesOf(erasmusIndex),
      ewpHeisWithMultiplePics: ewp.heis
        .filter((h) => h.pics.length > 1)
        .map((h) => ({ heiId: h.heiId, values: h.pics })),
      ewpHeisWithMultipleErasmusCodes: ewp.heis
        .filter((h) => h.erasmusCodes.length > 1)
        .map((h) => ({ heiId: h.heiId, values: h.erasmusCodes })),
      echePicSharedByMultipleRows: duplicateEcheValues(echeRows, (r) => r.pic),
      echeErasmusSharedByMultipleRows: duplicateEcheValues(echeRows, (r) => r.erasmusCode),
    },
    domainShapeAnalysis: measureDomainShapeOverlap(echeRows, rows, foldedHeiIds),
    conflicts: rows.filter((r) => r.grade === 'CONFLICT'),
    ambiguousRows: rows.filter((r) => r.grade === 'AMBIGUOUS'),
    rows,
  };
}

/**
 * The end-to-end measurement: two artifacts in, one report out.
 * No database, no network, no mutation.
 */
export async function measureEcheEwpCoverage(
  echeXlsxBytes: Buffer,
  ewpXmlBytes: Buffer,
): Promise<EcheEwpCoverageReport> {
  const workbook = await parseEcheWorkbook(echeXlsxBytes);

  // Rows that cannot be compared are COUNTED, not discarded: the denominator
  // this measurement reports is the artifact's row count, and a row we could
  // not read is not the same finding as a row EWP did not publish.
  const rows: EcheComparableRow[] = [];
  let unusable = 0;
  for (const raw of workbook.rows) {
    const comparable = toComparableRow(raw);
    if (comparable === null) unusable += 1;
    else rows.push(comparable);
  }

  return compareEcheToEwp(rows, toComparableHeis(ewpXmlBytes), unusable);
}
