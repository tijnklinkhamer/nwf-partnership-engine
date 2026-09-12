/**
 * EVIDENCE CANONICALISATION - the ONE definition of what "canonical evidence
 * text" means in this repository (Phase 2B-2D2B-1).
 *
 *   canonicalEvidenceText(text) = NFC(decodeHtml4EntitiesOnce(text))
 *
 * WHY THIS EXISTS
 *
 *   `extract.ts` shipped with a THIRTEEN-name entity map. Every other named
 *   entity survived extraction verbatim, so a French institutional page
 *   publishing `Coop&eacute;ration internationale` persisted that literal
 *   string into `orgunit_page_evidence.main_text`. A classifier then read
 *   `&eacute;` as content, and an evidence span the model quoted back could
 *   not verify against text nobody would ever type. The owner-preserved
 *   2D2B measurement found 153 of 716 persisted evidence rows carrying
 *   undecoded entities across 32 distinct entity names, and ZERO mojibake -
 *   the defect was entity decoding during extraction, nothing else. See
 *   `docs/audits/PHASE_2B_2D2B_REMOTE_TRUTH_RECOVERY_2026-09.md`.
 *
 * WHY EXACTLY THE 252 HTML 4.01 NAMES, AND NOT ONE MORE
 *
 *   The table below is the complete W3C HTML 4.01 named-character-entity set:
 *   `HTMLlat1.ent` (96) + `HTMLsymbol.ent` (124) + `HTMLspecial.ent` (32) =
 *   252. It was generated from those three official W3C entity-declaration
 *   files rather than recalled, and independently cross-checked name-by-name
 *   against the WHATWG `entities.json` table: 250 of 252 agree exactly. The
 *   two that do not are `lang` and `rang`, which HTML5 REMAPPED to U+27E8 /
 *   U+27E9; HTML 4.01 defines them as U+2329 / U+232A, and this table is the
 *   HTML 4.01 table, so the HTML 4.01 code points are what it carries.
 *
 *   `&apos;` IS DELIBERATELY ABSENT. It is an XML/HTML5 name, not one of the
 *   252, and the pre-2D2B thirteen-name map carried it as an unreviewed
 *   exception. Widening a "complete HTML 4.01 table" with a name HTML 4.01
 *   does not define would make the table's own claim false, so `&apos;`
 *   stays LITERAL. An unknown name stays literal for the same reason: this
 *   module never guesses at a character an author did not name.
 *
 * ONE PASS, NEVER TWO
 *
 *   `decodeHtml4EntitiesOnce` scans its input exactly once and never re-scans
 *   its own output, so `&amp;eacute;` canonicalises to the literal
 *   `&eacute;` - what the author wrote - and NOT to `é`. Re-running a decoder
 *   over decoded text is how an escaped entity silently becomes a character
 *   the document never contained.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - repair mojibake. The 2D2B measurement observed NONE, and the earlier
 *     "Ã" hypothesis found no support. A repair rule with no measured
 *     population to repair is a rule that can only damage correct text.
 *   - fold case, whitespace, punctuation or quote style, or apply any
 *     semantic normalisation. Evidence text is what the document said;
 *     `evidenceVerification.ts` owns the (deliberately different, and
 *     deliberately narrow) folding each verification rule permits.
 *   - apply NFKC. NFC is CANONICAL composition, which never changes which
 *     character a reader sees; NFKC is COMPATIBILITY folding, which would
 *     rewrite ligatures, superscripts and full-width forms into different
 *     characters than the page published.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

/**
 * The complete W3C HTML 4.01 named-character-entity table, in specification
 * order, grouped by the official entity-set file each name comes from.
 *
 * CASE-SENSITIVE BY CONSTRUCTION: HTML 4.01 distinguishes `&Eacute;` from
 * `&eacute;` and `&Alpha;` from `&alpha;`, so lookups here are exact-key and
 * must never be lower-cased.
 */
export const HTML4_NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  // HTMLlat1.ent (96): ISO 8859-1 (Latin-1) characters.
  nbsp: '\u00A0',
  iexcl: '\u00A1',
  cent: '\u00A2',
  pound: '\u00A3',
  curren: '\u00A4',
  yen: '\u00A5',
  brvbar: '\u00A6',
  sect: '\u00A7',
  uml: '\u00A8',
  copy: '\u00A9',
  ordf: '\u00AA',
  laquo: '\u00AB',
  not: '\u00AC',
  shy: '\u00AD',
  reg: '\u00AE',
  macr: '\u00AF',
  deg: '\u00B0',
  plusmn: '\u00B1',
  sup2: '\u00B2',
  sup3: '\u00B3',
  acute: '\u00B4',
  micro: '\u00B5',
  para: '\u00B6',
  middot: '\u00B7',
  cedil: '\u00B8',
  sup1: '\u00B9',
  ordm: '\u00BA',
  raquo: '\u00BB',
  frac14: '\u00BC',
  frac12: '\u00BD',
  frac34: '\u00BE',
  iquest: '\u00BF',
  Agrave: '\u00C0',
  Aacute: '\u00C1',
  Acirc: '\u00C2',
  Atilde: '\u00C3',
  Auml: '\u00C4',
  Aring: '\u00C5',
  AElig: '\u00C6',
  Ccedil: '\u00C7',
  Egrave: '\u00C8',
  Eacute: '\u00C9',
  Ecirc: '\u00CA',
  Euml: '\u00CB',
  Igrave: '\u00CC',
  Iacute: '\u00CD',
  Icirc: '\u00CE',
  Iuml: '\u00CF',
  ETH: '\u00D0',
  Ntilde: '\u00D1',
  Ograve: '\u00D2',
  Oacute: '\u00D3',
  Ocirc: '\u00D4',
  Otilde: '\u00D5',
  Ouml: '\u00D6',
  times: '\u00D7',
  Oslash: '\u00D8',
  Ugrave: '\u00D9',
  Uacute: '\u00DA',
  Ucirc: '\u00DB',
  Uuml: '\u00DC',
  Yacute: '\u00DD',
  THORN: '\u00DE',
  szlig: '\u00DF',
  agrave: '\u00E0',
  aacute: '\u00E1',
  acirc: '\u00E2',
  atilde: '\u00E3',
  auml: '\u00E4',
  aring: '\u00E5',
  aelig: '\u00E6',
  ccedil: '\u00E7',
  egrave: '\u00E8',
  eacute: '\u00E9',
  ecirc: '\u00EA',
  euml: '\u00EB',
  igrave: '\u00EC',
  iacute: '\u00ED',
  icirc: '\u00EE',
  iuml: '\u00EF',
  eth: '\u00F0',
  ntilde: '\u00F1',
  ograve: '\u00F2',
  oacute: '\u00F3',
  ocirc: '\u00F4',
  otilde: '\u00F5',
  ouml: '\u00F6',
  divide: '\u00F7',
  oslash: '\u00F8',
  ugrave: '\u00F9',
  uacute: '\u00FA',
  ucirc: '\u00FB',
  uuml: '\u00FC',
  yacute: '\u00FD',
  thorn: '\u00FE',
  yuml: '\u00FF',
  // HTMLsymbol.ent (124): symbols, mathematical symbols and Greek letters.
  fnof: '\u0192',
  Alpha: '\u0391',
  Beta: '\u0392',
  Gamma: '\u0393',
  Delta: '\u0394',
  Epsilon: '\u0395',
  Zeta: '\u0396',
  Eta: '\u0397',
  Theta: '\u0398',
  Iota: '\u0399',
  Kappa: '\u039A',
  Lambda: '\u039B',
  Mu: '\u039C',
  Nu: '\u039D',
  Xi: '\u039E',
  Omicron: '\u039F',
  Pi: '\u03A0',
  Rho: '\u03A1',
  Sigma: '\u03A3',
  Tau: '\u03A4',
  Upsilon: '\u03A5',
  Phi: '\u03A6',
  Chi: '\u03A7',
  Psi: '\u03A8',
  Omega: '\u03A9',
  alpha: '\u03B1',
  beta: '\u03B2',
  gamma: '\u03B3',
  delta: '\u03B4',
  epsilon: '\u03B5',
  zeta: '\u03B6',
  eta: '\u03B7',
  theta: '\u03B8',
  iota: '\u03B9',
  kappa: '\u03BA',
  lambda: '\u03BB',
  mu: '\u03BC',
  nu: '\u03BD',
  xi: '\u03BE',
  omicron: '\u03BF',
  pi: '\u03C0',
  rho: '\u03C1',
  sigmaf: '\u03C2',
  sigma: '\u03C3',
  tau: '\u03C4',
  upsilon: '\u03C5',
  phi: '\u03C6',
  chi: '\u03C7',
  psi: '\u03C8',
  omega: '\u03C9',
  thetasym: '\u03D1',
  upsih: '\u03D2',
  piv: '\u03D6',
  bull: '\u2022',
  hellip: '\u2026',
  prime: '\u2032',
  Prime: '\u2033',
  oline: '\u203E',
  frasl: '\u2044',
  weierp: '\u2118',
  image: '\u2111',
  real: '\u211C',
  trade: '\u2122',
  alefsym: '\u2135',
  larr: '\u2190',
  uarr: '\u2191',
  rarr: '\u2192',
  darr: '\u2193',
  harr: '\u2194',
  crarr: '\u21B5',
  lArr: '\u21D0',
  uArr: '\u21D1',
  rArr: '\u21D2',
  dArr: '\u21D3',
  hArr: '\u21D4',
  forall: '\u2200',
  part: '\u2202',
  exist: '\u2203',
  empty: '\u2205',
  nabla: '\u2207',
  isin: '\u2208',
  notin: '\u2209',
  ni: '\u220B',
  prod: '\u220F',
  sum: '\u2211',
  minus: '\u2212',
  lowast: '\u2217',
  radic: '\u221A',
  prop: '\u221D',
  infin: '\u221E',
  ang: '\u2220',
  and: '\u2227',
  or: '\u2228',
  cap: '\u2229',
  cup: '\u222A',
  int: '\u222B',
  there4: '\u2234',
  sim: '\u223C',
  cong: '\u2245',
  asymp: '\u2248',
  ne: '\u2260',
  equiv: '\u2261',
  le: '\u2264',
  ge: '\u2265',
  sub: '\u2282',
  sup: '\u2283',
  nsub: '\u2284',
  sube: '\u2286',
  supe: '\u2287',
  oplus: '\u2295',
  otimes: '\u2297',
  perp: '\u22A5',
  sdot: '\u22C5',
  lceil: '\u2308',
  rceil: '\u2309',
  lfloor: '\u230A',
  rfloor: '\u230B',
  lang: '\u2329',
  rang: '\u232A',
  loz: '\u25CA',
  spades: '\u2660',
  clubs: '\u2663',
  hearts: '\u2665',
  diams: '\u2666',
  // HTMLspecial.ent (32): markup-significant and internationalization characters.
  quot: '\u0022',
  amp: '\u0026',
  lt: '\u003C',
  gt: '\u003E',
  OElig: '\u0152',
  oelig: '\u0153',
  Scaron: '\u0160',
  scaron: '\u0161',
  Yuml: '\u0178',
  circ: '\u02C6',
  tilde: '\u02DC',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  zwnj: '\u200C',
  zwj: '\u200D',
  lrm: '\u200E',
  rlm: '\u200F',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201A',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bdquo: '\u201E',
  dagger: '\u2020',
  Dagger: '\u2021',
  permil: '\u2030',
  lsaquo: '\u2039',
  rsaquo: '\u203A',
  euro: '\u20AC',
});

/** Named (HTML 4.01 only), decimal and hexadecimal character references. */
const ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Decodes named, decimal and hexadecimal HTML character references in ONE
 * left-to-right pass over `text`, tolerantly: anything it cannot resolve -
 * an unknown name, a malformed number - is left exactly as written.
 *
 * The numeric handling is UNCHANGED from the pre-2D2B `decodeEntities`: this
 * slice widened the NAMED table from 13 entries to the full 252 and removed
 * the non-HTML4 `apos`, and touched nothing else about how a `&#233;` or a
 * `&#xE9;` is read.
 */
export function decodeHtml4EntitiesOnce(text: string): string {
  return text.replace(ENTITY_PATTERN, (match, body: string) => {
    // `#X` is unreachable under ENTITY_PATTERN, which admits only a
    // lowercase `x` - an uppercase `&#XE9;` matches nothing and stays
    // literal. The branch is kept exactly as it was: this slice widened the
    // NAMED table and deliberately changed nothing about numeric handling.
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML4_NAMED_ENTITIES[body] ?? match;
  });
}

/**
 * The SECOND half of canonicalisation: Unicode NFC composition.
 *
 * Exported as its own function because `extract.ts` composes the two halves
 * ACROSS its pipeline rather than in one call - it must decode before it
 * collapses whitespace (so `&nbsp;` becomes a space rather than a literal
 * U+00A0), and compose afterwards. Splitting the definition here keeps that
 * composition visible and auditable instead of leaving a bare
 * `.normalize('NFC')` in the extractor with nothing tying it to this
 * contract.
 *
 * NFC, never NFKC: canonical composition never changes which character a
 * reader sees, while compatibility folding would rewrite ligatures,
 * superscripts and full-width forms into characters the page never published.
 */
export function composeCanonicalForm(text: string): string {
  return text.normalize('NFC');
}

/**
 * THE canonical form of one piece of evidence text: one HTML 4.01 entity
 * decoding pass, then Unicode NFC.
 *
 * NFC comes AFTER decoding, never before, because decoding is what produces
 * the characters that need composing - a page writing `e&#769;` (e + U+0301
 * COMBINING ACUTE ACCENT) yields the decomposed pair only once the reference
 * is resolved, and NFC then composes it to `é` (U+00E9). Running NFC first
 * would see only the literal `&#769;`.
 *
 * IDEMPOTENT ON ITS OWN OUTPUT ONLY IN THE ABSENCE OF LITERAL `&`-SEQUENCES.
 * That is the point of the v1/v2 gate in `classify/document.ts`: canonical
 * text is produced exactly ONCE per document, at extraction under
 * `orgunit-extraction-v2` or at assembly for rows persisted under
 * `orgunit-extraction-v1`, and never at both.
 */
export function canonicalEvidenceText(text: string): string {
  return composeCanonicalForm(decodeHtml4EntitiesOnce(text));
}
