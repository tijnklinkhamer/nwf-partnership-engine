/**
 * DOCUMENT CONSTRUCTION - turns one deduped group of eligible subjects into
 * the model-facing `ClassifierDocument` shape (still without `docIndex`,
 * which `ordering.ts` assigns after final batch placement).
 *
 * CANONICALISES EVIDENCE THAT PREDATES CANONICAL EXTRACTION, and nothing
 * else. `orgunit-extraction-v1` rows carry undecoded HTML entities and can
 * never be re-extracted - no response body is stored anywhere in this
 * repository - so their text is canonicalised here, at read time, exactly
 * once. `extractionRuleVersion` itself is passed through UNCHANGED as
 * provenance: a reader can always see that a canonical document was derived
 * from v1 bytes rather than produced by v2 extraction. See
 * `canonicaliserFor` below.
 *
 * READS ONLY ALREADY-REDACTED, ALREADY-BOUNDED EVIDENCE. `title`,
 * `headings` and `mainText` on `orgunit_page_evidence` are redacted at
 * extraction time (`extract.ts`'s own module comment: "REDACTS every
 * returned textual field before returning it - not as a separate step a
 * caller might forget"). This module reads those persisted columns and
 * nothing else - no re-read of a response body, no re-read of raw HTML,
 * because neither exists anywhere in this database (design §18).
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { canonicalEvidenceText } from '../web/evidenceCanonical.js';
import { truncateToCodePointLimit } from '../web/extract.js';
import {
  EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION,
  MAX_EXCERPT_CODE_POINTS,
  MAX_HEADINGS_PER_DOCUMENT,
  MAX_HEADING_CODE_POINTS,
} from './constants.js';
import { distinctRootKeys, distinctTracks, distinctUrls, type DedupedGroup } from './dedupe.js';
import type { ClassifierDocument, ClassifierRootRef, ClassifierSignal, Heading } from './types.js';

/**
 * Builds one document's content from a deduped group.
 *
 * `rootRefsByKey` resolves a root key to its human-readable URL and
 * authority kind - the same lookup the batch-level context uses, so a
 * document's own `roots` field and the batch's `roots` field always agree
 * about what a given root key means.
 */
export function buildDocumentContent(
  group: DedupedGroup,
  rootRefsByKey: ReadonlyMap<string, ClassifierRootRef>,
): Omit<ClassifierDocument, 'docIndex'> {
  const { representative } = group;
  const canonicalise = canonicaliserFor(representative.extractionRuleVersion);
  const { text: excerpt, truncated: excerptTruncated } = truncateToCodePointLimit(
    representative.mainText,
    MAX_EXCERPT_CODE_POINTS,
  );

  return {
    url: representative.url,
    title: representative.title === null ? null : canonicalise(representative.title),
    declaredLang: representative.declaredLang,
    headings: boundHeadings(representative.headings, canonicalise),
    excerpt: canonicalise(excerpt),
    mainTextTruncated: representative.mainTextTruncated,
    excerptTruncated,
    extractionRuleVersion: representative.extractionRuleVersion,
    discoveryMethod: representative.discoveryMethod,
    roots: resolveRoots(distinctRootKeys(group), rootRefsByKey),
    trackMembership: distinctTracks(group),
    duplicateUrls: distinctUrls(group).filter((url) => url !== representative.url),
    signals: mergeSignals(group),
  };
}

function boundHeadings(
  headings: readonly Heading[],
  canonicalise: (text: string) => string,
): readonly Heading[] {
  return headings.slice(0, MAX_HEADINGS_PER_DOCUMENT).map((heading) => ({
    level: heading.level,
    text: canonicalise(truncateToCodePointLimit(heading.text, MAX_HEADING_CODE_POINTS).text),
  }));
}

/**
 * THE V1/V2 CANONICALISATION GATE.
 *
 * Returns `canonicalEvidenceText` for evidence persisted under the one
 * extraction version that predates canonical extraction, and the IDENTITY
 * function for everything else. Evidence written under
 * `orgunit-extraction-v2` is already canonical; running the decoder over it
 * again would resolve an author's literal `&amp;eacute;` into `é`, silently
 * inventing a character the page never contained.
 *
 * Canonicalisation is applied AFTER bounding, not before. Decoding only ever
 * shortens text (an entity reference is longer than the character it names),
 * so a bounded-then-canonicalised field is still within its bound, and doing
 * it in this order keeps the excerpt boundary a function of the PERSISTED
 * bytes alone - the same boundary a v1 assembly chose, so the only thing
 * that changes between assembly versions is the decoding, never which text
 * was selected. A cut that lands mid-reference leaves a partial `&eac`,
 * which stays literal, deterministically.
 */
function canonicaliserFor(extractionRuleVersion: string): (text: string) => string {
  return extractionRuleVersion === EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION
    ? canonicalEvidenceText
    : (text) => text;
}

function resolveRoots(
  rootKeys: readonly string[],
  rootRefsByKey: ReadonlyMap<string, ClassifierRootRef>,
): readonly ClassifierRootRef[] {
  return rootKeys.map((rootKey) => {
    const ref = rootRefsByKey.get(rootKey);
    if (ref === undefined) {
      // Every eligible candidate's root_key traces back to a ROOT-discovery
      // fetch observation from the same run (the frontier always starts
      // there) - see `loaders.ts`'s `loadRootRefs` comment. Reaching this
      // branch would mean that invariant broke.
      throw new Error(`No root reference resolvable for root_key ${rootKey}.`);
    }
    return ref;
  });
}

/**
 * Merges every subject's signals in a group into one deduped, canonically
 * ordered list. Different URL variants sharing identical bytes can score
 * differently (scoring reads the URL itself, among other fields), so this
 * deliberately does not collapse to the representative's signals alone -
 * doing so would silently discard real explanatory evidence a sibling
 * URL variant contributed.
 *
 * Canonical order: track, then rule id, then field - never DB row order
 * (design §44).
 */
function mergeSignals(group: DedupedGroup): readonly ClassifierSignal[] {
  const seen = new Set<string>();
  const merged: ClassifierSignal[] = [];
  for (const subject of group.subjects) {
    for (const signal of subject.signals) {
      const key = `${signal.track} ${signal.id} ${signal.field} ${signal.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(signal);
    }
  }
  return merged.sort(compareSignals);
}

function compareSignals(a: ClassifierSignal, b: ClassifierSignal): number {
  return (
    compareStrings(a.track, b.track) ||
    compareStrings(a.id, b.id) ||
    compareStrings(a.field, b.field) ||
    compareStrings(a.kind, b.kind)
  );
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
