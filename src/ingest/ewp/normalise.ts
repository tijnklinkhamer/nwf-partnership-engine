/**
 * Conservative normalisation of EWP catalogue entries.
 *
 * The rule this module exists to enforce: a RAW PUBLISHED VALUE and a
 * COMPARISON VALUE are different things, and only the raw one is evidence. A
 * comparison value is produced only where the transformation is deterministic
 * and already justified, and is NULL everywhere else. NULL means "not
 * deterministically comparable" - never "absent", because the published value
 * is always kept.
 *
 * What this deliberately does NOT do:
 *   - repair a malformed identifier. The live catalogue publishes PIC values in
 *     scientific notation ("9.9958762E8") and PIC values that are plainly OIDs
 *     ("E10158141"). Guessing the intended digits would fabricate an official
 *     identifier, so those simply have no comparison value.
 *   - infer a country. The <institutions> block publishes no country field at
 *     all, and neither the Erasmus-code prefix nor the SCHAC identifier's
 *     suffix may be used as one - Phase 1A already measured that the Erasmus
 *     prefix is not the country ("B DIEPENB07" is in NL).
 *   - treat a SCHAC identifier as a domain, a website or a crawl target.
 *   - invent semantics for an identifier type this repository has not seen.
 */
import { normaliseErasmusCode } from '../eche/normalise.js';
import type { EwpHeiEntry, EwpOtherId } from './parse.js';

/**
 * Erasmus-code normalisation is deliberately IMPORTED from the ECHE module
 * rather than reimplemented here.
 *
 * There is one Erasmus code system, so there must be one normalisation rule; a
 * second copy would drift and would quietly break exactly the comparison this
 * phase exists to make. The rule was verified collision-free on the ECHE
 * dataset in Phase 1A, and it is what makes the two sources comparable at all:
 * ECHE pads codes with U+00A0, EWP pads the same codes with two ordinary
 * spaces ("F  THONON03"), and collapsing whitespace maps both onto one value.
 *
 * This is not the beginning of a shared source-adapter framework. Two concrete
 * implementations are supposed to make the eventual abstraction obvious; one
 * shared function is not that abstraction.
 */
export { normaliseErasmusCode };

/** Identifier type as published, folded for grouping only. */
export function foldIdType(rawType: string): string {
  return rawType.trim().toLowerCase();
}

/**
 * SCHAC-style HEI identifier, folded for comparison.
 *
 * CASE FOLDING ONLY. The result is still an institutional identifier: it is not
 * a domain, not a website and not a crawl target, however domain-shaped it
 * looks. See the COMMENT ON COLUMN text on ewp_heis.hei_id.
 */
export function foldHeiId(rawHeiId: string): string {
  return rawHeiId.trim().toLowerCase();
}

/**
 * PIC comparison value: trimmed, and only when the result is all digits.
 *
 * ECHE publishes 6139 PIC values, every one of them non-blank and all digits.
 * EWP publishes eight that are not, so requiring the digit shape here is what
 * keeps a mangled value from silently failing to match while looking as though
 * it had been compared. A non-conforming value returns null and is reported.
 */
export function normalisePic(rawPic: string): string | null {
  const trimmed = rawPic.trim();
  return /^[0-9]+$/.test(trimmed) ? trimmed : null;
}

/** The identifier types for which a deterministic comparison rule exists. */
export const COMPARABLE_ID_TYPES = ['erasmus', 'pic'] as const;
export type ComparableIdType = (typeof COMPARABLE_ID_TYPES)[number];

/**
 * The comparison value for one published identifier, or null when this
 * repository has no justified deterministic rule for its type.
 */
export function normaliseOtherIdValue(foldedType: string, rawValue: string): string | null {
  if (foldedType === 'erasmus') {
    const normalised = normaliseErasmusCode(rawValue);
    return normalised === '' ? null : normalised;
  }
  if (foldedType === 'pic') return normalisePic(rawValue);
  // Every other type - erasmus-charter, euc, eche, oid, local, and anything
  // new - is preserved but not normalised. Inventing a rule would invent
  // semantics the source does not define.
  return null;
}

export interface NormalisedOtherId {
  ordinal: number;
  /** Type exactly as published, including its case. */
  type: string;
  /** Type folded to lower case, for grouping. */
  typeFolded: string;
  /** Value exactly as published, never repaired. */
  value: string;
  /** Deterministic comparison value, or null when no justified rule exists. */
  valueNormalised: string | null;
}

export interface NormalisedEwpHei {
  documentIndex: number;
  /** SCHAC-style identifier exactly as published. NOT a website. */
  heiId: string;
  heiIdFolded: string;
  names: Array<{ lang: string | null; value: string }>;
  otherIds: NormalisedOtherId[];
}

export function normaliseOtherIds(otherIds: readonly EwpOtherId[]): NormalisedOtherId[] {
  return otherIds.map((other, ordinal) => {
    const typeFolded = foldIdType(other.type);
    return {
      ordinal,
      type: other.type,
      typeFolded,
      value: other.value,
      valueNormalised: normaliseOtherIdValue(typeFolded, other.value),
    };
  });
}

export function normaliseHei(hei: EwpHeiEntry): NormalisedEwpHei {
  return {
    documentIndex: hei.documentIndex,
    heiId: hei.heiId,
    heiIdFolded: foldHeiId(hei.heiId),
    names: hei.names.map((name) => ({ lang: name.lang, value: name.value })),
    otherIds: normaliseOtherIds(hei.otherIds),
  };
}

/**
 * The distinct comparison values of one type carried by one HEI.
 *
 * Returns a SET, never a single value: five HEIs in the live catalogue carry
 * two Erasmus codes and seven carry two PICs. Some of those pairs collapse
 * under normalisation (whitespace variants of one code) and some genuinely do
 * not ("CG PODGORICA01" and "ME PODGORI02" are Montenegro's old and new
 * prefixes). Picking one would be entity resolution.
 */
export function comparableValues(hei: NormalisedEwpHei, foldedType: string): string[] {
  const values = new Set<string>();
  for (const other of hei.otherIds) {
    if (other.typeFolded === foldedType && other.valueNormalised !== null) {
      values.add(other.valueNormalised);
    }
  }
  return [...values].sort();
}
